/**
 * Testes da sincronização na nuvem com os emuladores do Firebase.
 * Rode com: npm run test:cloud  (sem os emuladores, estes testes são pulados).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc, updateDoc } from "firebase/firestore";
import { buildLedger } from "../src/domain/balances";
import { splitEqual } from "../src/domain/split";
import * as A from "../src/store/actions";
import { CloudStore } from "../src/store/cloud";
import { createDataset } from "../src/store/dataset";
import { run } from "../src/store/store";

const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = "demo-rateio";
const config = { apiKey: "demo-key", authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT };

const stores: CloudStore[] = [];

async function waitFor(cond: () => boolean, what: string, ms = 10000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`tempo esgotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function login(name: string, email: string): Promise<CloudStore> {
  const [host, port] = FS!.split(":");
  const store = new CloudStore({
    config,
    emulator: { host, firestorePort: Number(port), authPort: Number(AUTH!.split(":")[1]) },
    memoryCache: true,
    appName: `${name}-${Math.random()}`,
  });
  stores.push(store);
  const token = JSON.stringify({ sub: email, email, email_verified: true, name });
  await signInWithCredential(store.auth, GoogleAuthProvider.credential(token));
  await waitFor(() => store.getStatus().phase === "ready", `${name} pronto`);
  return store;
}

const ds = (s: CloudStore) => s.getSnapshot()!;

describe.skipIf(!FS || !AUTH)("sincronização na nuvem (emulador)", () => {
  let diego: CloudStore;
  let ana: CloudStore;
  let carla: CloudStore;
  let group = "";
  let expense = "";
  const D = "m:diego@example.com";
  const ANA = "m:ana@example.com";
  const C = "m:carla@example.com";

  beforeAll(async () => {
    await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
    await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
    diego = await login("Diego", "diego@example.com");
    ana = await login("Ana", "ana@example.com");
    carla = await login("Carla", "carla@example.com");
  }, 30000);

  afterAll(async () => {
    await Promise.all(stores.map((s) => s.dispose()));
  });

  it("cria grupo e despesa e a outra pessoa recebe", async () => {
    expect(ds(diego).meId).toBe(D);
    const anaId = run(diego, A.addPerson, { name: "Ana Souza", email: "ana@example.com" });
    expect(anaId).toBe(ANA);
    const bruno = run(diego, A.addPerson, { name: "Bruno" });
    await waitFor(() => !!ds(diego).people[bruno], "contato salvo");
    group = run(diego, A.createGroup, { name: "Casa", type: "home", currency: "BRL", simplifyDebts: true, memberIds: [ANA, bruno] });
    expense = run(diego, A.saveExpense, {
      groupId: group, description: "Mercado", cost: 30000, currency: "BRL", date: "2026-10-10", category: "food.groceries",
      paidBy: { [D]: 30000 }, owedBy: splitEqual(30000, [D, ANA, bruno]), splitMode: "equal", repeat: "never",
    });
    await waitFor(() => !!ds(ana).expenses[expense], "Ana recebe a despesa");
    const a = ds(ana);
    expect(a.groups[group].name).toBe("Casa");
    expect(a.people[bruno].name).toBe("Bruno");
    expect(a.people[D].name).toBe("Diego");
    expect(buildLedger(a).friendBalance.get(D)).toEqual({ BRL: -10000 });
    // quem não participa não vê nada
    expect(Object.keys(ds(carla).groups)).toHaveLength(0);
    expect(Object.keys(ds(carla).expenses)).toHaveLength(0);
  });

  it("bloqueia leitura direta por quem não participa", async () => {
    const fs = getFirestore((carla as unknown as { app: Parameters<typeof getFirestore>[0] }).app);
    await expect(getDoc(doc(fs, "groups", group))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(fs, "expenses", expense))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(updateDoc(doc(fs, "groups", group), { name: "invadido" })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDoc(doc(fs, "users", diego.auth.currentUser!.uid))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      setDoc(doc(fs, "profiles", "diego@example.com"), { name: "Falso", email: "diego@example.com", color: 1 }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    // criar algo em nome de outros, sem se incluir, também é bloqueado
    await expect(
      setDoc(doc(fs, "groups", "intruso"), { name: "X", visibleTo: ["diego@example.com"], memberIds: [] }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("acerto de contas aparece para os dois", async () => {
    run(ana, A.recordPayments, [{ from: ANA, to: D, amount: 10000, currency: "BRL", date: "2026-10-12", groupId: group }]);
    await waitFor(() => Object.values(ds(diego).expenses).some((e) => e.payment), "Diego recebe o pagamento");
    expect(buildLedger(ds(diego)).friendBalance.get(ANA) || {}).toEqual({});
  });

  it("comentários simultâneos não se perdem", async () => {
    run(diego, A.addComment, expense, "Comprei tudo");
    run(ana, A.addComment, expense, "Valeu!");
    await waitFor(
      () => ds(diego).expenses[expense].comments.length === 2 && ds(ana).expenses[expense].comments.length === 2,
      "dois comentários nos dois lados",
    );
  });

  it("edição feita por um membro chega ao outro com histórico", async () => {
    const e = ds(ana).expenses[expense];
    run(ana, A.saveExpense, { ...e, description: "Mercado do mês" }, expense);
    await waitFor(() => ds(diego).expenses[expense].description === "Mercado do mês", "Diego vê a edição");
    const h = ds(diego).expenses[expense].history;
    expect(h.map((x) => x.type)).toEqual(["created", "updated"]);
    expect(h[1].by).toBe(ANA);
  });

  it("quem entra no grupo passa a ver as despesas antigas", async () => {
    run(diego, A.addPerson, { name: "Carla", email: "carla@example.com" });
    await waitFor(() => !!ds(diego).people[C], "contato da Carla");
    run(diego, A.addMembers, group, [C]);
    await waitFor(() => !!ds(carla).groups[group] && !!ds(carla).expenses[expense], "Carla vê grupo e despesa");
    expect(ds(carla).groups[group].memberIds).toContain(C);
    expect(buildLedger(ds(carla)).total).toEqual({});
  });

  it("nome e chave Pix escolhidos pela própria pessoa aparecem para os outros", async () => {
    run(ana, A.updatePerson, ANA, { name: "Ana S.", email: "ana@example.com", pix: "ana@pix.com" });
    const fresh = await login("Diego2", "diego@example.com");
    await waitFor(() => ds(fresh).people[ANA]?.name === "Ana S.", "novo nome da Ana");
    expect(ds(fresh).people[ANA].pix).toBe("ana@pix.com");
  });

  it("exclusão e restauração sincronizam", async () => {
    run(ana, A.deleteExpense, expense);
    await waitFor(() => !!ds(diego).expenses[expense].deletedAt, "Diego vê a exclusão");
    run(diego, A.restoreExpense, expense);
    await waitFor(() => !ds(ana).expenses[expense].deletedAt, "Ana vê a restauração");
    expect(ds(ana).expenses[expense].history.map((x) => x.type)).toEqual(["created", "updated", "deleted", "restored"]);
  });

  it("envia os dados do modo local para a nuvem", async () => {
    let n = 0;
    const ctx = { now: "2026-10-01T10:00:00.000Z", today: "2026-10-01", id: (p = "") => `${p}local${++n}` };
    let local = createDataset(ctx, { name: "Carla", currency: "BRL" });
    const localCtx = { ...ctx, me: local.meId };
    const apply = <T,>(r: A.Result<T>) => {
      for (const op of r.ops) {
        if (op.t === "person") local = { ...local, people: { ...local.people, [op.next.id]: op.next } };
        if (op.t === "group") local = { ...local, groups: { ...local.groups, [op.next.id]: op.next } };
        if (op.t === "expense") local = { ...local, expenses: { ...local.expenses, [op.next.id]: op.next } };
      }
      return r.value;
    };
    const dani = apply(A.addPerson(local, localCtx, { name: "Dani", email: "dani@example.com" }));
    const g = apply(A.createGroup(local, localCtx, { name: "Viagem", type: "trip", currency: "BRL", simplifyDebts: false, memberIds: [dani] }));
    const e = apply(
      A.saveExpense(local, localCtx, {
        groupId: g, description: "Pousada", cost: 50000, currency: "BRL", date: "2026-09-30", category: "transport.hotel",
        paidBy: { [local.meId]: 50000 }, owedBy: splitEqual(50000, [local.meId, dani]), splitMode: "equal", repeat: "never",
      }),
    );
    carla.replace(local);
    await waitFor(() => !!ds(carla).expenses[e], "despesa enviada");
    expect(ds(carla).groups[g].memberIds).toEqual([C, dani]);
    expect(ds(carla).expenses[e].paidBy).toEqual({ [C]: 50000 });
    const dStore = await login("Dani", "dani@example.com");
    await waitFor(() => !!ds(dStore).expenses[e], "Dani recebe a viagem");
    expect(buildLedger(ds(dStore)).friendBalance.get(C)).toEqual({ BRL: -25000 });
  });

  it("sair do grupo remove o acesso", async () => {
    run(carla, A.removeMember, group, C);
    await waitFor(() => !ds(carla).groups[group], "grupo some para a Carla");
    await waitFor(() => !ds(diego).groups[group].memberIds.includes(C), "Diego vê a saída");
  });
});
