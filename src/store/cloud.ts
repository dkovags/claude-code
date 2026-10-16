import { deleteApp, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  connectAuthEmulator, getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup,
  signInWithRedirect, signOut, type Auth, type User,
} from "firebase/auth";
import {
  arrayRemove, arrayUnion, collection, connectFirestoreEmulator, deleteField, doc, FieldPath, getDoc, initializeFirestore,
  memoryLocalCache, onSnapshot, persistentLocalCache, persistentMultipleTabManager, query, setDoc, terminate, updateDoc,
  where, writeBatch, type DocumentReference, type Firestore, type Unsubscribe,
} from "firebase/firestore";
import { participants } from "../domain/balances";
import { colorFor } from "../domain/people";
import type { Dataset, Expense, Group, ID, Person, Prefs } from "../domain/types";
import { normalizeDataset } from "./dataset";
import { applyOps, type Op } from "./ops";
import { emailId, renamePersonOps } from "./rename";
import type { DataStore, StoreStatus } from "./store";

/** Nome e e-mail das pessoas citadas, guardados junto com o grupo/despesa para todos verem os nomes. */
interface PersonInfo {
  name: string;
  email?: string;
  color: number;
}

type Shared = { people: Record<ID, PersonInfo>; visibleTo: string[] };
type GroupDoc = Group & Shared;
type ExpenseDoc = Expense & Shared;

/** Documento particular de cada usuário: amigos que ele cadastrou e preferências. */
interface UserDoc {
  people?: Record<ID, Person>;
  prefs?: Prefs;
}

interface Profile {
  name: string;
  email: string;
  color: number;
  pix?: string;
}

export interface CloudOptions {
  config: FirebaseOptions;
  /** Emuladores locais do Firebase (desenvolvimento e testes). */
  emulator?: { host: string; firestorePort: number; authPort: number };
  /** Cache só em memória (testes no Node). Por padrão o cache fica no aparelho e o app funciona offline. */
  memoryCache?: boolean;
  /** Nome da instância do Firebase (permite vários usuários no mesmo processo, nos testes). */
  appName?: string;
}

const emailOf = (id: ID): string | null => (id.startsWith("m:") ? id.slice(2) : null);
const json = (v: unknown) => JSON.stringify(v ?? null);

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  if (code.includes("permission-denied")) return "Sem permissão para alterar estes dados na nuvem.";
  if (code.includes("unavailable")) return "Sem conexão com a nuvem. As alterações serão enviadas quando a internet voltar.";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "Login cancelado.";
  if (code.includes("unauthorized-domain"))
    return "Este endereço não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).";
  return "Não foi possível sincronizar com a nuvem.";
}

/**
 * Dados na nuvem (Firebase Firestore), compartilhados entre os participantes:
 * cada grupo e cada despesa é um documento com a lista "visibleTo" (e-mails de quem pode ver).
 */
export class CloudStore implements DataStore {
  readonly mode = "cloud" as const;
  readonly auth: Auth;
  private app: FirebaseApp;
  private db: Firestore;
  private user: User | null = null;
  private email = "";
  private meId: ID = "";
  private status: StoreStatus = { phase: "loading" };
  private groups = new Map<ID, GroupDoc>();
  private expenses = new Map<ID, ExpenseDoc>();
  private userDoc: UserDoc = {};
  private profiles = new Map<string, Profile>();
  private requestedProfiles = new Set<string>();
  private loaded = { groups: false, expenses: false, user: false };
  private ds: Dataset | null = null;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(msg: string) => void>();
  private unsubs: Unsubscribe[] = [];
  private pending = 0;
  private stopAuth: Unsubscribe;

  constructor(opts: CloudOptions) {
    this.app = initializeApp(opts.config, opts.appName);
    this.db = initializeFirestore(this.app, {
      ignoreUndefinedProperties: true,
      localCache: opts.memoryCache ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    this.auth = getAuth(this.app);
    if (opts.emulator) {
      connectFirestoreEmulator(this.db, opts.emulator.host, opts.emulator.firestorePort);
      connectAuthEmulator(this.auth, `http://${opts.emulator.host}:${opts.emulator.authPort}`, { disableWarnings: true });
      // só com os emuladores: login direto, usado pelos testes automatizados no navegador
      (globalThis as { __rateioEmulatorLogin?: unknown }).__rateioEmulatorLogin = (email: string, name: string) =>
        signInWithCredential(
          this.auth,
          GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })),
        );
    }
    this.stopAuth = onAuthStateChanged(this.auth, (u) => this.onUser(u));
  }

  /* ---------- leitura ---------- */

  getSnapshot = (): Dataset | null => this.ds;
  getStatus = (): StoreStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onError(listener: (msg: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setStatus(patch: Partial<StoreStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit();
  }

  private reportError(err: unknown) {
    console.error(err);
    const msg = friendlyError(err);
    this.errorListeners.forEach((l) => l(msg));
  }

  private onUser(u: User | null) {
    this.unsubs.forEach((f) => f());
    this.unsubs = [];
    this.groups.clear();
    this.expenses.clear();
    this.userDoc = {};
    this.loaded = { groups: false, expenses: false, user: false };
    this.ds = null;
    this.user = u;
    if (!u || !u.email) {
      this.email = "";
      this.meId = "";
      this.status = { phase: "signedOut" };
      this.emit();
      return;
    }
    this.email = u.email.toLowerCase();
    this.meId = emailId(this.email);
    this.status = { phase: "loading", email: this.email, pending: 0 };
    this.emit();

    const userRef = this.userRef();
    // garante o documento do usuário (para as atualizações seguintes) e o perfil público com o nome
    this.track(setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true }));
    const profileRef = doc(this.db, "profiles", this.email);
    getDoc(profileRef)
      .then((snap) => {
        if (!snap.exists())
          return this.track(
            setDoc(profileRef, {
              name: u.displayName || this.email.split("@")[0],
              email: this.email,
              color: colorFor(this.meId),
            }),
          );
      })
      // sem internet no primeiro acesso: o perfil é criado numa próxima vez
      .catch(() => {});

    const visible = (name: string) => query(collection(this.db, name), where("visibleTo", "array-contains", this.email));
    this.unsubs.push(
      onSnapshot(
        visible("groups"),
        (snap) => {
          this.groups = new Map(snap.docs.map((d) => [d.id, { ...(d.data() as GroupDoc), id: d.id }]));
          this.loaded.groups = true;
          this.rebuild();
        },
        (e) => this.reportError(e),
      ),
      onSnapshot(
        visible("expenses"),
        (snap) => {
          this.expenses = new Map(snap.docs.map((d) => [d.id, { ...(d.data() as ExpenseDoc), id: d.id }]));
          this.loaded.expenses = true;
          this.rebuild();
        },
        (e) => this.reportError(e),
      ),
      onSnapshot(
        userRef,
        (snap) => {
          this.userDoc = (snap.data() as UserDoc) || {};
          this.loaded.user = true;
          this.rebuild();
        },
        (e) => this.reportError(e),
      ),
      onSnapshot(
        profileRef,
        (snap) => {
          if (snap.exists()) this.profiles.set(this.email, snap.data() as Profile);
          this.rebuild();
        },
        () => {},
      ),
    );
  }

  /** Busca o perfil (nome escolhido pela própria pessoa) de quem já usa o app. */
  private requestProfile(email: string) {
    if (this.requestedProfiles.has(email)) return;
    this.requestedProfiles.add(email);
    getDoc(doc(this.db, "profiles", email))
      .then((snap) => {
        if (snap.exists()) {
          this.profiles.set(email, snap.data() as Profile);
          this.rebuild();
        }
      })
      .catch(() => {});
  }

  /** Monta o conjunto de dados que a interface usa a partir dos documentos recebidos. */
  private rebuild() {
    if (!this.user || !this.loaded.groups || !this.loaded.expenses || !this.loaded.user) return;
    const people: Record<ID, Person> = {};
    const addInfo = (id: ID, info: PersonInfo | undefined, createdAt: string) => {
      if (!info || people[id]) return;
      people[id] = { id, name: info.name, color: info.color ?? colorFor(id), createdAt };
      if (info.email) people[id].email = info.email;
    };
    const groups: Record<ID, Group> = {};
    for (const g of this.groups.values()) {
      const { people: info, visibleTo: _v, ...rest } = g;
      for (const [id, p] of Object.entries(info || {})) addInfo(id, p, g.createdAt);
      groups[g.id] = rest as Group;
    }
    const expenses: Record<ID, Expense> = {};
    for (const e of this.expenses.values()) {
      const { people: info, visibleTo: _v, ...rest } = e;
      for (const [id, p] of Object.entries(info || {})) addInfo(id, p, e.createdAt);
      expenses[e.id] = rest as Expense;
    }
    // amigos que eu cadastrei (com o nome que eu dei, e se removi da lista)
    for (const [id, p] of Object.entries(this.userDoc.people || {})) people[id] = { ...people[id], ...p, id };
    // quem já usa o app aparece com o nome que escolheu
    for (const p of Object.values(people)) {
      const mail = emailOf(p.id);
      if (!mail) continue;
      const prof = this.profiles.get(mail);
      if (prof) {
        p.name = prof.name;
        if (prof.pix) p.pix = prof.pix;
      } else this.requestProfile(mail);
    }
    const myProfile = this.profiles.get(this.email);
    people[this.meId] = {
      ...people[this.meId],
      id: this.meId,
      name: myProfile?.name || this.user.displayName || this.email.split("@")[0],
      email: this.email,
      color: myProfile?.color ?? colorFor(this.meId),
      createdAt: people[this.meId]?.createdAt || "",
    };
    delete people[this.meId].hidden;
    if (myProfile?.pix) people[this.meId].pix = myProfile.pix;
    else delete people[this.meId].pix;
    try {
      this.ds = normalizeDataset({
        version: 1,
        meId: this.meId,
        people,
        groups,
        expenses,
        prefs: this.userDoc.prefs || { currency: "BRL", theme: "auto" },
      });
    } catch (e) {
      this.reportError(e);
      return;
    }
    this.status = { ...this.status, phase: "ready" };
    this.emit();
  }

  /* ---------- escrita ---------- */

  private userRef(): DocumentReference {
    return doc(this.db, "users", this.user!.uid);
  }

  private track<T>(p: Promise<T>): Promise<T | void> {
    this.pending++;
    this.setStatus({ pending: this.pending });
    return p
      .catch((e) => this.reportError(e))
      .finally(() => {
        this.pending--;
        this.setStatus({ pending: this.pending });
      });
  }

  private infoFor(ids: Iterable<ID>): Record<ID, PersonInfo> {
    const out: Record<ID, PersonInfo> = {};
    for (const id of ids) {
      const p = this.ds?.people[id];
      if (!p) continue;
      out[id] = { name: p.name, color: p.color };
      if (p.email) out[id].email = p.email;
    }
    return out;
  }

  private emails(ids: Iterable<ID>): string[] {
    const out = new Set<string>([this.email]);
    for (const id of ids) {
      const e = emailOf(id);
      if (e) out.add(e);
    }
    return [...out];
  }

  /** Pessoas citadas numa despesa (participantes e autores de alterações e comentários). */
  private expensePeople(e: Expense): Set<ID> {
    const ids = new Set<ID>(participants(e));
    ids.add(e.createdBy);
    for (const h of e.history) ids.add(h.by);
    for (const c of e.comments) ids.add(c.by);
    if (e.updatedBy) ids.add(e.updatedBy);
    if (e.deletedBy) ids.add(e.deletedBy);
    return ids;
  }

  private expenseVisibleTo(e: Expense): string[] {
    const ids = new Set<ID>(participants(e));
    const g = e.groupId ? this.ds?.groups[e.groupId] : null;
    if (g) for (const id of g.memberIds) ids.add(id);
    return this.emails(ids);
  }

  /** Campos de nível superior que mudaram, com deleteField() para os que sumiram. */
  private changedFields<T extends object>(prev: T, next: T, skip: string[]): [string | FieldPath, unknown][] {
    const out: [string | FieldPath, unknown][] = [];
    const p = prev as Record<string, unknown>;
    const n = next as Record<string, unknown>;
    for (const k of new Set([...Object.keys(p), ...Object.keys(n)])) {
      if (skip.includes(k) || json(p[k]) === json(n[k])) continue;
      out.push([k, n[k] === undefined ? deleteField() : n[k]]);
    }
    return out;
  }

  /** Lista que só cresceu: grava com arrayUnion (não perde o que outra pessoa acrescentou ao mesmo tempo). */
  private appendOrSet(field: string, prev: unknown[], next: unknown[]): [string, unknown][] {
    if (json(prev) === json(next)) return [];
    const isPrefix = next.length >= prev.length && json(next.slice(0, prev.length)) === json(prev);
    return [[field, isPrefix ? arrayUnion(...next.slice(prev.length)) : next]];
  }

  private update(ref: DocumentReference, pairs: [string | FieldPath, unknown][]) {
    if (!pairs.length) return;
    const [[f0, v0], ...rest] = pairs;
    this.track(updateDoc(ref, f0 as string, v0, ...rest.flat()));
  }

  /** Pessoas citadas num grupo: membros e autores do histórico. */
  private groupPeople(g: Group): Set<ID> {
    const ids = new Set<ID>(g.memberIds);
    ids.add(g.createdBy);
    for (const h of g.history) {
      ids.add(h.by);
      if (h.personId) ids.add(h.personId);
    }
    return ids;
  }

  private writeGroup(prev: Group | undefined, next: Group) {
    const ref = doc(this.db, "groups", next.id);
    if (!prev) {
      this.track(setDoc(ref, { ...next, people: this.infoFor(this.groupPeople(next)), visibleTo: this.emails(next.memberIds) }));
      return;
    }
    const pairs: [string | FieldPath, unknown][] = [
      ...this.changedFields(prev, next, ["history", "memberIds"]),
      ...this.appendOrSet("history", prev.history, next.history),
    ];
    const added = next.memberIds.filter((id) => !prev.memberIds.includes(id));
    const removed = prev.memberIds.filter((id) => !next.memberIds.includes(id));
    if (added.length && !removed.length) {
      pairs.push(["memberIds", arrayUnion(...added)]);
      const mails = added.map(emailOf).filter((x): x is string => !!x);
      if (mails.length) pairs.push(["visibleTo", arrayUnion(...mails)]);
    } else if (removed.length && !added.length) {
      pairs.push(["memberIds", arrayRemove(...removed)]);
      const mails = removed.map(emailOf).filter((x): x is string => !!x);
      if (mails.length) pairs.push(["visibleTo", arrayRemove(...mails)]);
    } else if (added.length || removed.length) {
      pairs.push(["memberIds", next.memberIds], ["visibleTo", this.emails(next.memberIds)]);
    }
    // nomes de quem aparece no grupo (novos membros e autores de alterações) e ainda não está no documento
    const known = this.groups.get(next.id)?.people || {};
    for (const [id, info] of Object.entries(this.infoFor(this.groupPeople(next))))
      if (json(known[id]) !== json(info)) pairs.push([new FieldPath("people", id), info]);
    this.update(ref, pairs);
    if (added.length || removed.length) this.syncGroupExpenses(next.id, added, removed);
  }

  /** Quem entra no grupo passa a ver as despesas dele; quem sai deixa de ver as que não o envolvem. */
  private syncGroupExpenses(groupId: ID, added: ID[], removed: ID[]) {
    const addMails = added.map(emailOf).filter((x): x is string => !!x);
    const removeMails = removed.map(emailOf).filter((x): x is string => !!x);
    if (!addMails.length && !removeMails.length) return;
    const list = [...this.expenses.values()].filter((e) => e.groupId === groupId);
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const e of list.slice(i, i + 400)) {
        const ref = doc(this.db, "expenses", e.id);
        if (addMails.length) batch.update(ref, { visibleTo: arrayUnion(...addMails) });
        const involved = new Set(participants(e).map(emailOf));
        const drop = removeMails.filter((m) => !involved.has(m));
        if (drop.length) batch.update(ref, { visibleTo: arrayRemove(...drop) });
      }
      this.track(batch.commit());
    }
  }

  private writeExpense(prev: Expense | undefined, next: Expense) {
    const ref = doc(this.db, "expenses", next.id);
    const people = this.infoFor(this.expensePeople(next));
    const visibleTo = this.expenseVisibleTo(next);
    if (!prev) {
      this.track(setDoc(ref, { ...next, people, visibleTo }));
      return;
    }
    const prevDoc = this.expenses.get(next.id);
    const pairs: [string | FieldPath, unknown][] = [
      ...this.changedFields(prev, next, ["history", "comments"]),
      ...this.appendOrSet("history", prev.history, next.history),
      ...this.appendOrSet("comments", prev.comments, next.comments),
    ];
    if (json(prevDoc?.visibleTo?.slice().sort()) !== json(visibleTo.slice().sort())) pairs.push(["visibleTo", visibleTo]);
    for (const [id, info] of Object.entries(people))
      if (json(prevDoc?.people?.[id]) !== json(info)) pairs.push([new FieldPath("people", id), info]);
    this.update(ref, pairs);
  }

  commit(ops: Op[]): void {
    if (!this.ds || !this.user || !ops.length) return;
    // mostra na hora; os documentos chegam depois pelos ouvintes
    this.ds = applyOps(this.ds, ops);
    this.emit();
    for (const op of ops) {
      switch (op.t) {
        case "person":
          if (op.next.id === this.meId) {
            this.track(
              setDoc(doc(this.db, "profiles", this.email), {
                name: op.next.name,
                email: this.email,
                color: op.next.color,
                pix: op.next.pix,
              }),
            );
          } else {
            this.update(this.userRef(), [[new FieldPath("people", op.next.id), op.next]]);
            // o novo nome também vai para os grupos e despesas em que a pessoa aparece
            this.propagateName(op.next);
          }
          break;
        case "removePerson":
          this.update(this.userRef(), [[new FieldPath("people", op.id), deleteField()]]);
          break;
        case "prefs":
          this.update(this.userRef(), [["prefs", op.next]]);
          break;
        case "group":
          this.writeGroup(op.prev, op.next);
          break;
        case "expense":
          this.writeExpense(op.prev, op.next);
          break;
        case "meId":
          break;
      }
    }
  }

  /** Atualiza o nome guardado nos documentos compartilhados quando eu renomeio um amigo sem conta. */
  private propagateName(p: Person) {
    if (emailOf(p.id) && this.profiles.has(emailOf(p.id)!)) return;
    const info: PersonInfo = { name: p.name, color: p.color };
    if (p.email) info.email = p.email;
    for (const g of this.groups.values())
      if (g.people?.[p.id] && json(g.people[p.id]) !== json(info))
        this.update(doc(this.db, "groups", g.id), [[new FieldPath("people", p.id), info]]);
    for (const e of this.expenses.values())
      if (e.people?.[p.id] && json(e.people[p.id]) !== json(info))
        this.update(doc(this.db, "expenses", e.id), [[new FieldPath("people", p.id), info]]);
  }

  /**
   * Envia dados (de um backup ou do modo local) para a nuvem, juntando com o que já existe.
   * O usuário do arquivo passa a ser a conta Google conectada.
   */
  replace(data: Dataset | null): void {
    if (!data || !this.ds || !this.user) return;
    let src = data;
    if (src.meId !== this.meId) {
      const ops: Op[] = [{ t: "removePerson", id: src.meId }, ...renamePersonOps(src, src.meId, this.meId), { t: "meId", id: this.meId }];
      src = applyOps(src, ops);
    }
    const ops: Op[] = [];
    for (const p of Object.values(src.people)) if (p.id !== this.meId && !this.ds.people[p.id]) ops.push({ t: "person", next: p });
    for (const g of Object.values(src.groups))
      ops.push({ t: "group", next: { ...g, memberIds: g.memberIds.includes(this.meId) ? g.memberIds : [this.meId, ...g.memberIds] } });
    for (const e of Object.values(src.expenses)) ops.push({ t: "expense", next: e });
    this.commit(ops);
  }

  /* ---------- conta ---------- */

  async signIn(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(this.auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code || "";
      if (code.includes("popup-blocked") || code.includes("operation-not-supported")) await signInWithRedirect(this.auth, provider);
      else throw new Error(friendlyError(e));
    }
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async dispose(): Promise<void> {
    this.stopAuth();
    this.unsubs.forEach((f) => f());
    await terminate(this.db);
    await deleteApp(this.app);
  }
}
