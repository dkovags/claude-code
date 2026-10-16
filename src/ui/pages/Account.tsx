import { Download, FileSpreadsheet, Pencil, Smartphone, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { APP_NAME } from "../../config";
import { expensesToCsv } from "../../domain/csv";
import { todayISO } from "../../domain/dates";
import { CURRENCIES } from "../../domain/money";
import type { Theme } from "../../domain/types";
import * as A from "../../store/actions";
import { normalizeDataset, toBackup } from "../../store/dataset";
import { Avatar } from "../components/basics";
import { Page } from "../components/Shell";
import { useData, useRun, useStore, useUI } from "../context";
import { downloadFile } from "../download";
import { navigate } from "../router";

export function AccountPage() {
  const { ds, ledger, me } = useData();
  const store = useStore();
  const ui = useUI();
  const runAction = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const person = ds.people[me];

  const importFile = async (file: File) => {
    try {
      const data = normalizeDataset(JSON.parse(await file.text()));
      ui.open({
        type: "confirm",
        title: "Importar backup",
        message: `Substituir todos os dados deste aparelho pelo backup “${file.name}”? Os dados atuais serão perdidos (faça um backup antes, se precisar).`,
        confirmLabel: "Importar",
        danger: true,
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
            Os dados ficam guardados neste aparelho. Faça backups de vez em quando e use-os para passar tudo para outro
            aparelho.
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

        <section className="account-card">
          <h2>
            <Smartphone size={18} /> Instalar no celular
          </h2>
          <p className="small">
            No <b>Android</b> (Chrome): menu ⋮ e “Instalar app” ou “Adicionar à tela inicial”. No <b>iPhone</b> (Safari):
            botão Compartilhar e “Adicionar à Tela de Início”. O {APP_NAME} abre como um aplicativo e funciona sem internet.
          </p>
        </section>

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
        <div className="muted small center pad">
          {APP_NAME} · versão {__APP_VERSION__}
        </div>
      </div>
    </Page>
  );
}
