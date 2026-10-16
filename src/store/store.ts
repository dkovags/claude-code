import { todayISO } from "../domain/dates";
import { newId } from "../domain/ids";
import type { Dataset } from "../domain/types";
import type { Ctx, Result } from "./actions";
import { normalizeDataset } from "./dataset";
import { applyOps, type Op } from "./ops";

export interface StoreStatus {
  /** loading: carregando; signedOut: precisa entrar (nuvem); ready: pronto. */
  phase: "loading" | "signedOut" | "ready";
  email?: string;
  /** Alterações ainda não enviadas ao servidor. */
  pending?: number;
  /** Erro que impediu o carregamento. */
  error?: string;
}

export interface DataStore {
  readonly mode: "local" | "cloud";
  getSnapshot(): Dataset | null;
  getStatus(): StoreStatus;
  subscribe(listener: () => void): () => void;
  /** Aplica alterações. Erros de gravação são avisados pelos ouvintes de onError. */
  commit(ops: Op[]): void;
  /** Substitui todos os dados (cadastro inicial, importação de backup ou apagar tudo). */
  replace(ds: Dataset | null): void;
  onError(listener: (msg: string) => void): () => void;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = "rateio:data:v1";

/** Dados guardados no próprio aparelho (localStorage). */
export class LocalStore implements DataStore {
  readonly mode = "local" as const;
  private ds: Dataset | null = null;
  /** Conteúdo bruto que não pôde ser lido (para o usuário baixar e não perder nada). */
  corrupted: string | null = null;
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(msg: string) => void>();

  constructor(private storage: KeyValueStorage, private key = STORAGE_KEY) {
    this.ds = this.read();
    if (typeof window !== "undefined")
      window.addEventListener("storage", (ev) => {
        if (ev.key !== this.key) return;
        this.ds = this.read();
        this.emit();
      });
  }

  private read(): Dataset | null {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
      if (!raw) return null;
      return normalizeDataset(JSON.parse(raw));
    } catch {
      this.corrupted = raw;
      return null;
    }
  }

  private write(ds: Dataset | null): boolean {
    try {
      if (ds) this.storage.setItem(this.key, JSON.stringify(ds));
      else this.storage.removeItem(this.key);
      return true;
    } catch {
      this.errorListeners.forEach((l) => l("Não foi possível salvar neste aparelho (armazenamento cheio ou bloqueado)."));
      return false;
    }
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  getSnapshot = (): Dataset | null => this.ds;

  private readonly readyStatus: StoreStatus = { phase: "ready" };
  getStatus = (): StoreStatus => this.readyStatus;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  commit(ops: Op[]): void {
    if (!this.ds || !ops.length) return;
    const next = applyOps(this.ds, ops);
    if (!this.write(next)) return;
    this.ds = next;
    this.emit();
  }

  replace(ds: Dataset | null): void {
    if (!this.write(ds)) return;
    this.corrupted = null;
    this.ds = ds;
    this.emit();
  }

  onError(listener: (msg: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}

/** Armazenamento em memória (testes e quando o navegador bloqueia o localStorage). */
export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function makeCtx(ds: Dataset): Ctx {
  return { me: ds.meId, now: new Date().toISOString(), today: todayISO(), id: newId };
}

/** Executa uma ação sobre os dados atuais e grava o resultado. Lança UserError se algo estiver inválido. */
export function run<T, A extends unknown[]>(
  store: DataStore,
  action: (ds: Dataset, ctx: Ctx, ...args: A) => Result<T>,
  ...args: A
): T {
  const ds = store.getSnapshot();
  if (!ds) throw new Error("Dados ainda não carregados.");
  const { ops, value } = action(ds, makeCtx(ds), ...args);
  store.commit(ops);
  return value;
}
