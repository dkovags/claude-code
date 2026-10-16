import { Cloud, CloudOff, Download, FileSpreadsheet, LogOut, Pencil, Smartphone, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { APP_NAME } from "../../config";
import { expensesToCsv } from "../../domain/csv";
import { todayISO } from "../../domain/dates";
import { CURRENCIES } from "../../domain/money";
import type { Dataset, Theme } from "../../domain/types";
import * as A from "../../store/actions";
import type { CloudStore } from "../../store/cloud";
import { normalizeDataset, toBackup } from "../../store/dataset";
import { getFirebaseConfig, switchMode } from "../../store/firebaseConfig";
import { STORAGE_KEY } from "../../store/store";
import { Avatar } from "../components/basics";
import { Page } from "../components/Shell";
import { useData, useRun, useStatus, useStore, useUI } from "../context";
import { downloadFile } from "../download";
import { useInstallPrompt } from "../install";
import { navigate } from "../router";

/** Dados do modo local guardados neste aparelho (para enviar à nuvem). */
function localData(): Dataset | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = normalizeDataset(JSON.parse(raw));
    return Object.keys(d.groups).length || Object.keys(d.expenses).length ? d : null;
  } catch {
    return null;
  }
}

function SyncSection() {
  const store = useStore();
  const status = useStatus();
  const ui = useUI();
  const [local] = useState(() => (store.mode === "cloud" ? localData() : null));
  const [uploaded, setUploaded] = useState(() => {
    try {
      return localStorage.getItem("rateio:uploadedAt");
    } catch {
      return null;
    }
  });
  const hasCloud = !!getFirebaseConfig();

  if (store.mode === "cloud") {
    const cloud = store as CloudStore;
    const upload = () =>
      ui.open({
        type: "confirm",
        title: "Enviar dados deste aparelho",
        message: `Enviar ${Object.keys(local!.groups).length} grupo(s) e ${Object.keys(local!.expenses).length} despesa(s) guardados neste aparelho para a sua conta? Os amigos com e-mail cadastrado passam a vê-los.`,
        confirmLabel: "Enviar",
        onConfirm: () => {
          store.replace(local);
          const now = new Date().toISOString();
          try {
            localStorage.setItem("rateio:uploadedAt", now);
          } catch {
            /* sem armazenamento */
          }
          setUploaded(now);
          ui.toast("Dados enviados para a nuvem.");
        },
      });
    return (
      <section className="account-card">
        <h2>
          <Cloud size={18} /> Sincronização na nuvem
        </h2>
        <p className="small">
          Conectado como <b>{status.email}</b>. Grupos e despesas ficam salvos na sua conta e aparecem para quem participa
          deles, em qualquer aparelho.
        </p>
        <p className="muted small">
          {status.pending ? `Enviando ${status.pending} alteração(ões)…` : "Tudo sincronizado."}
        </p>
        <div className="account-actions">
          {local && !uploaded && (
            <button className="btn btn-mint" onClick={upload}>
              <Upload size={16} /> Enviar dados deste aparelho
            </button>
          )}
          <button className="btn btn-gray" onClick={() => cloud.signOut()}>
            <LogOut size={16} /> Sair da conta
          </button>
          <button className="btn btn-gray" onClick={() => switchMode("local")}>
            <CloudOff size={16} /> Usar só neste aparelho
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="account-card">
      <h2>
        <Cloud size={18} /> Sincronizar com amigos
      </h2>
      {hasCloud ? (
        <>
          <p className="small">
            Entre com sua conta Google para compartilhar grupos e despesas com seus amigos, cada um no seu celular. Depois
            de entrar, você pode enviar os dados deste aparelho para a nuvem.
          </p>
          <button className="btn btn-google" onClick={() => switchMode("cloud")}>
            Entrar com Google
          </button>
        </>
      ) : (
        <p className="muted small">
          Por enquanto os dados ficam só neste aparelho. Para que cada amigo veja e lance despesas no próprio celular, ative
          a sincronização na nuvem (Firebase), como explicado no README do projeto.
        </p>
      )}
    </section>
  );
}

export function AccountPage() {
  const { ds, ledger, me } = useData();
  const store = useStore();
  const ui = useUI();
  const runAction = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const person = ds.people[me];
  const cloud = store.mode === "cloud";
  const install = useInstallPrompt();

  const importFile = async (file: File) => {
    try {
      const data = normalizeDataset(JSON.parse(await file.text()));
      ui.open({
        type: "confirm",
        title: "Importar backup",
        message: cloud
          ? `Enviar o conteúdo do backup “${file.name}” para a sua conta na nuvem? Ele é somado aos dados que já estão lá.`
          : `Substituir todos os dados deste aparelho pelo backup “${file.name}”? Os dados atuais serão perdidos (faça um backup antes, se precisar).`,
        confirmLabel: "Importar",
        danger: !cloud,
        onConfirm: () => {
          store.replace(data);
          navigate("/");
          ui.toast("Backup importado.");
        },
      });
    } catch (e) {
      ui.toast(e instanceof A.UserError ? e.message : "Não foi possível ler este arquivo.", { kind: "error" });
    }
  };

  return (
    <Page title="Sua conta" hideHeaderOnMobile>
      <div className="mobile-title only-mobile">Conta</div>
      <div className="account">
        <section className="account-card profile">
          <Avatar person={person} size={72} />
          <div className="profile-info">
            <div className="profile-name">{person.name}</div>
            <div className="muted">{person.email || "sem e-mail"}</div>
            {person.pix ? (
              <div className="muted small">Chave Pix: {person.pix}</div>
            ) : (
              <div className="muted small">Cadastre sua chave Pix em Editar para facilitar os pagamentos.</div>
            )}
          </div>
          <button className="btn btn-gray btn-sm" onClick={() => ui.open({ type: "friend", personId: me })}>
            <Pencil size={14} /> Editar
          </button>
        </section>

        <section className="account-card">
          <h2>Preferências</h2>
          <label className="field inline">
            <span>Moeda padrão</span>
            <select value={ds.prefs.currency} onChange={(e) => runAction(A.setPrefs, { currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} – {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field inline">
            <span>Aparência</span>
            <select value={ds.prefs.theme} onChange={(e) => runAction(A.setPrefs, { theme: e.target.value as Theme })}>
              <option value="auto">Automática</option>
              <option value="light">Clara</option>
              <option value="dark">Escura</option>
            </select>
          </label>
        </section>

        <section className="account-card">
          <h2>Seus dados</h2>
          <p className="muted small">
            {cloud
              ? "Seus dados ficam na nuvem. O backup é uma cópia em arquivo, para guardar ou abrir em outro lugar."
              : "Os dados ficam guardados neste aparelho. Faça backups de vez em quando e use-os para passar tudo para outro aparelho."}
          </p>
          <div className="account-actions">
            <button
              className="btn btn-mint"
              onClick={() => downloadFile(`backup-${APP_NAME.toLowerCase()}-${todayISO()}.json`, toBackup(ds), "application/json")}
            >
              <Download size={16} /> Fazer backup
            </button>
            <button className="btn btn-gray" onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> Restaurar backup
            </button>
            <button
              className="btn btn-gray"
              onClick={() => downloadFile(`despesas-${todayISO()}.csv`, expensesToCsv(ds, ledger.active), "text/csv;charset=utf-8")}
            >
              <FileSpreadsheet size={16} /> Exportar planilha (CSV)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </section>

        <SyncSection />

        <section className="account-card">
          <h2>
            <Smartphone size={18} /> Instalar no celular
          </h2>
          {install && (
            <button className="btn btn-mint" onClick={install}>
              <Smartphone size={16} /> Instalar o {APP_NAME}
            </button>
          )}
          <p className="small">
            No <b>Android</b> (Chrome): menu ⋮ e “Instalar app” ou “Adicionar à tela inicial”. No <b>iPhone</b> (Safari):
            botão Compartilhar e “Adicionar à Tela de Início”. O {APP_NAME} abre como um aplicativo e funciona sem internet.
          </p>
        </section>

        {!cloud && (
        <section className="account-card danger">
          <h2>Zona de perigo</h2>
          <button
            className="btn btn-danger"
            onClick={() =>
              ui.open({
                type: "confirm",
                title: "Apagar todos os dados",
                message: "Apagar todos os grupos, amigos e despesas deste aparelho? Isso não pode ser desfeito.",
                confirmLabel: "Apagar tudo",
                danger: true,
                onConfirm: () => {
                  store.replace(null);
                  navigate("/");
                },
              })
            }
          >
            <Trash2 size={16} /> Apagar todos os dados
          </button>
        </section>
        )}
        <div className="muted small center pad">
          {APP_NAME} · versão {__APP_VERSION__}
        </div>
      </div>
    </Page>
  );
}
