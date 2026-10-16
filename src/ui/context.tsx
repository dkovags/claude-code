import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { buildLedger, type Ledger } from "../domain/balances";
import type { Dataset, ID } from "../domain/types";
import { UserError, type Ctx, type Result } from "../store/actions";
import { run, type DataStore } from "../store/store";

/* ---------- dados ---------- */

const StoreContext = createContext<DataStore | null>(null);

export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): DataStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider ausente");
  return s;
}

export function useDatasetOrNull(): Dataset | null {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

const ledgerCache = new WeakMap<Dataset, Ledger>();

export function ledgerOf(ds: Dataset): Ledger {
  let l = ledgerCache.get(ds);
  if (!l) {
    l = buildLedger(ds);
    ledgerCache.set(ds, l);
  }
  return l;
}

/** Dados atuais e saldos calculados (recalculados só quando os dados mudam). */
export function useData(): { ds: Dataset; ledger: Ledger; me: ID } {
  const ds = useDatasetOrNull();
  if (!ds) throw new Error("Dados não carregados");
  return useMemo(() => ({ ds, ledger: ledgerOf(ds), me: ds.meId }), [ds]);
}

/* ---------- interface: diálogos e avisos ---------- */

export type Dialog =
  | { type: "expense"; expenseId?: ID; groupId?: ID | null; friendId?: ID }
  | { type: "settle"; groupId?: ID | null; friendId?: ID; paymentId?: ID }
  | { type: "group"; groupId?: ID }
  | { type: "friend"; personId?: ID; email?: string }
  | { type: "expenseDetail"; expenseId: ID }
  | { type: "balances"; groupId: ID }
  | { type: "totals"; groupId?: ID | null; friendId?: ID }
  | { type: "charts"; groupId?: ID | null; friendId?: ID }
  | { type: "confirm"; title: string; message: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void };

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
  action?: { label: string; onClick: () => void };
}

export interface UI {
  dialogs: Dialog[];
  open: (d: Dialog) => void;
  close: () => void;
  closeAll: () => void;
  toasts: Toast[];
  toast: (text: string, opts?: { kind?: "ok" | "error"; action?: Toast["action"] }) => void;
  dismissToast: (id: number) => void;
}

export const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("UIContext ausente");
  return ui;
}

/** Resultado de useRun: o valor da ação (true para ações sem valor) ou undefined se falhou. */
export type RunResult<T> = [T] extends [void] ? true | undefined : T | undefined;

/**
 * Executa uma ação e mostra o erro num aviso se algo estiver inválido.
 * Devolve o resultado (true para ações sem valor), ou undefined quando a ação falhou.
 */
export function useRun() {
  const store = useStore();
  const ui = useUI();
  return useCallback(
    <T, A extends unknown[]>(action: (ds: Dataset, ctx: Ctx, ...args: A) => Result<T>, ...args: A): RunResult<T> => {
      try {
        const v = run(store, action, ...args);
        return (v === undefined ? true : v) as RunResult<T>;
      } catch (e) {
        if (e instanceof UserError) ui.toast(e.message, { kind: "error" });
        else {
          console.error(e);
          ui.toast("Algo deu errado. Tente novamente.", { kind: "error" });
        }
        return undefined as RunResult<T>;
      }
    },
    [store, ui],
  );
}

/* ---------- tela ---------- */

const mobileQuery = "(max-width: 760px)";

function subscribeMedia(cb: () => void) {
  const m = window.matchMedia(mobileQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMedia, () => window.matchMedia(mobileQuery).matches, () => false);
}
