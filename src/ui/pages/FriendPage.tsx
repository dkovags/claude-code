import { BellRing, ChartPie, Download, HandCoins, Receipt, Settings, Sigma, UserRound } from "lucide-react";
import { APP_NAME } from "../../config";
import { expensesToCsv } from "../../domain/csv";
import { currenciesOf, formatBalance, formatMoney, positivePart, isZero } from "../../domain/money";
import { firstName, personName } from "../../domain/people";
import type { ID } from "../../domain/types";
import { Avatar, EmptyState, OweText } from "../components/basics";
import { ExpenseList } from "../components/ExpenseList";
import { PixKey } from "../components/PixKey";
import { MainActions, Page } from "../components/Shell";
import { useData, useUI } from "../context";
import { downloadFile, shareText, slug } from "../download";
import { href } from "../router";

function FriendBalanceCard({ id }: { id: ID }) {
  const { ds, ledger } = useData();
  const bal = ledger.friendBalance.get(id) || {};
  const byGroup = ledger.friendByGroup.get(id);
  const first = firstName(personName(ds, id));
  const lines: { k: string; cur: string; v: number }[] = [];
  for (const [k, b] of byGroup || []) for (const cur of currenciesOf(b, ds.prefs.currency)) lines.push({ k, cur, v: b[cur] });
  return (
    <div className="side-card">
      <div className="side-title">Seu saldo</div>
      <div className="side-big">
        <OweText
          balance={bal}
          preferred={ds.prefs.currency}
          owesYou={`${first} deve a você`}
          youOwe={`Você deve a ${first}`}
          settled="Vocês estão quites."
        />
      </div>
      {lines.length > 1 &&
        lines.map((l) => (
          <div className="breakdown" key={`${l.k}:${l.cur}`}>
            {l.k ? <a href={href(`/groups/${l.k}`)}>{ds.groups[l.k]?.name}</a> : "Sem grupo"}:{" "}
            <span className={l.v > 0 ? "pos" : "neg"}>
              {l.v > 0 ? "deve a você" : "você deve"} {formatMoney(l.v, l.cur, { abs: true })}
            </span>
          </div>
        ))}
      <PixKey person={ds.people[id]} />
    </div>
  );
}

export function FriendPage({ id }: { id: ID }) {
  const { ds, ledger, me } = useData();
  const ui = useUI();
  const person = ds.people[id];
  if (!person || id === me)
    return (
      <Page title="Amigo não encontrado">
        <EmptyState icon={<UserRound size={44} />} title="Esta pessoa não está na sua lista." />
      </Page>
    );
  const shared = ledger.active.filter((e) => {
    const ids = [...Object.keys(e.paidBy), ...Object.keys(e.owedBy)];
    return ids.includes(id) && ids.includes(me);
  });
  const bal = ledger.friendBalance.get(id) || {};
  const owesMe = positivePart(bal);
  const myPix = ds.people[me]?.pix;
  const remind = () =>
    shareText(
      `Oi, ${firstName(person.name)}! Passando para lembrar do nosso acerto no ${APP_NAME}: ` +
        `ficou ${formatBalance(owesMe)} para você me pagar.` +
        (myPix ? ` Minha chave Pix: ${myPix}` : "") +
        " Valeu!",
    );
  const exportCsv = () =>
    downloadFile(`${slug(person.name)}.csv`, expensesToCsv(ds, shared, [me, id]), "text/csv;charset=utf-8");

  return (
    <Page
      title={person.name}
      icon={<Avatar person={person} size={44} />}
      actions={<MainActions friendId={id} />}
      right={<FriendBalanceCard id={id} />}
    >
      {person.hidden && <div className="banner info">{person.name} foi removido(a) da sua lista de amigos.</div>}
      <div className="group-hero only-mobile">
        <Avatar person={person} size={64} />
        <div>
          <div className="group-hero-name">{person.name}</div>
          {person.email && <div className="muted small">{person.email}</div>}
        </div>
      </div>
      <div className="narrow-only">
        <FriendBalanceCard id={id} />
      </div>
      <div className="toolbar">
        <button className="chip-btn orange" onClick={() => ui.open({ type: "settle", friendId: id })}>
          <HandCoins size={15} /> Acertar contas
        </button>
        {!isZero(owesMe) && (
          <button className="chip-btn" onClick={remind}>
            <BellRing size={15} /> Lembrar
          </button>
        )}
        <button className="chip-btn" onClick={() => ui.open({ type: "totals", friendId: id })}>
          <Sigma size={15} /> Totais
        </button>
        <button className="chip-btn" onClick={() => ui.open({ type: "charts", friendId: id })}>
          <ChartPie size={15} /> Gráficos
        </button>
        <button className="chip-btn" onClick={exportCsv}>
          <Download size={15} /> Exportar
        </button>
        <button className="chip-btn" onClick={() => ui.open({ type: "friend", personId: id })}>
          <Settings size={15} /> Configurações
        </button>
      </div>
      {shared.length ? (
        <ExpenseList expenses={shared} friendId={id} showGroup />
      ) : (
        <EmptyState icon={<Receipt size={44} />} title={`Nenhuma despesa com ${firstName(person.name)} ainda`}>
          <div className="empty-actions">
            <button className="btn btn-orange" onClick={() => ui.open({ type: "expense", friendId: id })}>
              Adicionar uma despesa
            </button>
          </div>
        </EmptyState>
      )}
    </Page>
  );
}
