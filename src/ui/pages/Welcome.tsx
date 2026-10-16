import { useRef, useState } from "react";
import { APP_NAME } from "../../config";
import { todayISO } from "../../domain/dates";
import { newId } from "../../domain/ids";
import { CURRENCIES } from "../../domain/money";
import * as A from "../../store/actions";
import type { CloudStore } from "../../store/cloud";
import { createDataset, normalizeDataset } from "../../store/dataset";
import { getFirebaseConfig, switchMode } from "../../store/firebaseConfig";
import { LocalStore } from "../../store/store";
import { Logo } from "../components/Logo";
import { useStore } from "../context";
import { downloadFile } from "../download";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.3 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <Logo size={72} inverted />
        <h1>{APP_NAME}</h1>
        <p className="tagline">Divida despesas com amigos, a casa, a viagem e o casal, sem planilha e sem confusão.</p>
        {children}
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div className="splash">
      <Logo size={64} inverted />
    </div>
  );
}

/** Primeiro acesso no modo "só neste aparelho". */
export function Onboarding() {
  const store = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState("BRL");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const corrupted = store instanceof LocalStore ? store.corrupted : null;
  const cloud = !!getFirebaseConfig();

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      store.replace(createDataset({ now: new Date().toISOString(), today: todayISO(), id: newId }, { name, email, currency }));
    } catch (err) {
      setError(err instanceof A.UserError ? err.message : "Não foi possível começar.");
    }
  };

  return (
    <Card>
      {corrupted && (
        <div className="banner warn">
          Os dados salvos neste aparelho estão danificados e não puderam ser abertos.{" "}
          <button className="link-btn" onClick={() => downloadFile("dados-danificados.json", corrupted, "application/json")}>
            Baixar uma cópia
          </button>{" "}
          antes de começar de novo.
        </div>
      )}
      {cloud && (
        <>
          <button className="btn btn-google btn-block" onClick={() => switchMode("cloud")}>
            <GoogleIcon /> Entrar com Google
          </button>
          <p className="muted small">Com a conta Google, seus amigos veem e lançam as despesas que vocês dividem.</p>
          <div className="or">ou use só neste aparelho</div>
        </>
      )}
      <form onSubmit={start}>
        <label className="field">
          <span>Como você se chama?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!cloud} placeholder="Seu nome" />
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
        <button className={`btn ${cloud ? "btn-gray" : "btn-orange"} btn-block`} type="submit">
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
    </Card>
  );
}

/** Tela de entrada do modo sincronizado. */
export function Login() {
  const store = useStore() as CloudStore;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <button
        className="btn btn-google btn-block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await store.signIn();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <GoogleIcon /> {busy ? "Entrando…" : "Entrar com Google"}
      </button>
      <p className="muted small">
        Entre com a mesma conta Google cujo e-mail seus amigos cadastraram: os grupos e despesas de vocês aparecem
        automaticamente.
      </p>
      {error && <div className="form-errors">{error}</div>}
      <button className="link-btn" onClick={() => switchMode("local")}>
        Usar sem conta, só neste aparelho
      </button>
    </Card>
  );
}
