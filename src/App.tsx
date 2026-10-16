import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "./config";
import { todayISO } from "./domain/dates";
import { newId } from "./domain/ids";
import { CURRENCIES } from "./domain/money";
import * as A from "./store/actions";
import { createDataset, normalizeDataset } from "./store/dataset";
import { run, type DataStore, LocalStore, MemoryStorage } from "./store/store";
import { Logo } from "./ui/components/Logo";
import { Shell } from "./ui/components/Shell";
import { StoreProvider, UIContext, useDatasetOrNull, useStore, useUI, type Dialog, type Toast, type UI } from "./ui/context";
import { ExpenseDialog } from "./ui/dialogs/ExpenseDialog";
import { FriendDialog } from "./ui/dialogs/FriendDialog";
import { GroupDialog } from "./ui/dialogs/GroupDialog";
import { BalancesDialog, ChartsDialog, ConfirmDialog, ExpenseDetailDialog, TotalsDialog } from "./ui/dialogs/InfoDialogs";
import { SettleDialog } from "./ui/dialogs/SettleDialog";
import { AccountPage } from "./ui/pages/Account";
import { ActivityPage } from "./ui/pages/Activity";
import { AllExpenses } from "./ui/pages/AllExpenses";
import { Dashboard, FriendsPage, GroupsPage } from "./ui/pages/Dashboard";
import { FriendPage } from "./ui/pages/FriendPage";
import { GroupPage, NonGroupPage } from "./ui/pages/GroupPage";
import { useRoute } from "./ui/router";
import { downloadFile } from "./ui/download";

function createStore(): DataStore {
  try {
    const storage = window.localStorage;
    storage.getItem("teste");
    return new LocalStore(storage);
  } catch {
    // navegador bloqueando o armazenamento (modo privado restrito): funciona só enquanto a página estiver aberta
    return new LocalStore(new MemoryStorage());
  }
}

function useTheme(theme: string | undefined) {
  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1f2a27" : "#5bc5a7");
    };
    apply();
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, [theme]);
}

function UIProvider({ children }: { children: React.ReactNode }) {
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<UI["toast"]>(
    (text, opts = {}) => {
      const id = ++seq.current;
      // um aviso igual ao anterior substitui o antigo, e ficam no máximo dois na tela
      setToasts((t) => [...t.filter((x) => x.text !== text).slice(-1), { id, text, kind: opts.kind || "ok", action: opts.action }]);
      setTimeout(() => dismissToast(id), opts.action ? 7000 : opts.kind === "error" ? 6000 : 3500);
    },
    [dismissToast],
  );
  const ui = useMemo<UI>(
    () => ({
      dialogs,
      open: (d) => setDialogs((s) => [...s, d]),
      close: () => setDialogs((s) => s.slice(0, -1)),
      closeAll: () => setDialogs([]),
      toasts,
      toast,
      dismissToast,
    }),
    [dialogs, toasts, toast, dismissToast],
  );
  return <UIContext.Provider value={ui}>{children}</UIContext.Provider>;
}

function DialogHost() {
  const ui = useUI();
  return (
    <>
      {ui.dialogs.map((d, i) => {
        const close = () => ui.close();
        const key = `${i}:${d.type}`;
        switch (d.type) {
          case "expense":
            return <ExpenseDialog key={key} {...d} onClose={close} />;
          case "settle":
            return <SettleDialog key={key} {...d} onClose={close} />;
          case "group":
            return <GroupDialog key={key} groupId={d.groupId} onClose={close} />;
          case "friend":
            return <FriendDialog key={key} personId={d.personId} email={d.email} onClose={close} />;
          case "expenseDetail":
            return <ExpenseDetailDialog key={key} expenseId={d.expenseId} onClose={close} />;
          case "balances":
            return <BalancesDialog key={key} groupId={d.groupId} onClose={close} />;
          case "totals":
            return <TotalsDialog key={key} groupId={d.groupId} friendId={d.friendId} onClose={close} />;
          case "charts":
            return <ChartsDialog key={key} groupId={d.groupId} friendId={d.friendId} onClose={close} />;
          case "confirm":
            return <ConfirmDialog key={key} {...d} onClose={close} />;
        }
      })}
    </>
  );
}

function Toasts() {
  const ui = useUI();
  return (
    <div className="toasts" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                ui.dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Pages() {
  const route = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, "id" in route ? route.id : ""]);
  switch (route.name) {
    case "activity":
      return <ActivityPage />;
    case "all":
      return <AllExpenses q={route.q} />;
    case "groups":
      return <GroupsPage />;
    case "friends":
      return <FriendsPage />;
    case "group":
      return <GroupPage id={route.id} />;
    case "friend":
      return <FriendPage id={route.id} />;
    case "nongroup":
      return <NonGroupPage />;
    case "account":
      return <AccountPage />;
    default:
      return <Dashboard />;
  }
}

/** Gera despesas recorrentes vencidas ao abrir o app e quando ele volta a ficar visível. */
function useRecurring() {
  const store = useStore();
  useEffect(() => {
    let last = "";
    const tick = () => {
      const today = todayISO();
      if (today === last || !store.getSnapshot()) return;
      last = today;
      try {
        run(store, A.spawnRecurring);
      } catch (e) {
        console.error(e);
      }
    };
    tick();
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(tick, 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(timer);
    };
  }, [store]);
}

function Main() {
  const ds = useDatasetOrNull();
  useTheme(ds?.prefs.theme);
  useRecurring();
  if (!ds) return <Onboarding />;
  return (
    <Shell>
      <Pages />
    </Shell>
  );
}

function Onboarding() {
  const store = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const corrupted = store instanceof LocalStore ? store.corrupted : null;

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      store.replace(createDataset({ now: new Date().toISOString(), today: todayISO(), id: newId }, { name, email, currency }));
    } catch (err) {
      setError(err instanceof A.UserError ? err.message : "Não foi possível começar.");
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Logo size={72} inverted />
        <h1>{APP_NAME}</h1>
        <p className="tagline">Divida despesas com amigos, a casa, a viagem e o casal, sem planilha e sem confusão.</p>
        {corrupted && (
          <div className="banner warn">
            Os dados salvos neste aparelho estão danificados e não puderam ser abertos.{" "}
            <button className="link-btn" onClick={() => downloadFile("dados-danificados.json", corrupted, "application/json")}>
              Baixar uma cópia
            </button>{" "}
            antes de começar de novo.
          </div>
        )}
        <form onSubmit={start}>
          <label className="field">
            <span>Como você se chama?</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Seu nome" />
          </label>
          <label className="field">
            <span>Seu e-mail (opcional)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
          </label>
          <label className="field">
            <span>Moeda principal</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} – {c.name}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="form-errors">{error}</div>}
          <button className="btn btn-orange btn-block" type="submit">
            Começar
          </button>
        </form>
        <button className="link-btn" onClick={() => fileRef.current?.click()}>
          Já tenho um backup: restaurar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              store.replace(normalizeDataset(JSON.parse(await f.text())));
            } catch (err) {
              setError(err instanceof A.UserError ? err.message : "Não foi possível ler este arquivo.");
            }
          }}
        />
      </div>
    </div>
  );
}

function ErrorListener() {
  const store = useStore();
  const ui = useUI();
  useEffect(() => store.onError((msg) => ui.toast(msg, { kind: "error" })), [store, ui]);
  return null;
}

export default function App() {
  const [store] = useState(createStore);
  return (
    <StoreProvider store={store}>
      <UIProvider>
        <ErrorListener />
        <Main />
        <DialogHost />
        <Toasts />
      </UIProvider>
    </StoreProvider>
  );
}
