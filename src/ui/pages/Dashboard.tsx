import { PartyPopper, UserPlus, Users } from "lucide-react";
import { todayISO } from "../../domain/dates";
import { currenciesOf, formatMoney, isZero } from "../../domain/money";
import { friendsOf, personName } from "../../domain/people";
import type { Balance, ID } from "../../domain/types";
import { Avatar, BalanceAmounts, EmptyState, GroupAvatar, OweText } from "../components/basics";
import { MainActions, Page } from "../components/Shell";
import { useData, useIsMobile, useUI } from "../context";
import { href } from "../router";

/** Linhas "em “Viagem”: deve R$ 10" com o detalhamento por grupo do saldo com um amigo. */
function GroupBreakdown({ friendId, sign, max = 3 }: { friendId: ID; sign?: 1 | -1; max?: number }) {
  const { ds, ledger } = useData();
  const byGroup = ledger.friendByGroup.get(friendId);
  if (!byGroup) return null;
  const lines: { key: string; name: string; cur: string; v: number }[] = [];
  for (const [k, b] of byGroup)
    for (const cur of currenciesOf(b, ds.prefs.currency)) {
      const v = b[cur];
      if (!v || (sign && Math.sign(v) !== sign)) continue;
      lines.push({ key: `${k}:${cur}`, name: k ? ds.groups[k]?.name || "grupo" : "sem grupo", cur, v });
    }
  // uma única linha "sem grupo" não acrescenta nada ao saldo já mostrado
  if (!lines.length || (lines.length === 1 && lines[0].name === "sem grupo")) return null;
  const first = personName(ds, friendId).split(" ")[0];
  return (
    <div className="breakdown">
      {lines.slice(0, max).map((l) => (
        <div key={l.key}>
          {l.v > 0 ? `${first} deve a você` : `Você deve a ${first}`}{" "}
          <span className={l.v > 0 ? "pos" : "neg"}>{formatMoney(l.v, l.cur, { abs: true })}</span>{" "}
          {l.name === "sem grupo" ? "fora de grupos" : <>em “{l.name}”</>}
        </div>
      ))}
      {lines.length > max && <div className="muted">e mais {lines.length - max}…</div>}
    </div>
  );
}

function FriendBalanceRow({ id, balance, sign }: { id: ID; balance: Balance; sign: 1 | -1 }) {
  const { ds } = useData();
  const part: Balance = {};
  for (const [c, v] of Object.entries(balance)) if (Math.sign(v) === sign) part[c] = v;
  return (
    <a className="friend-balance" href={href(`/friends/${encodeURIComponent(id)}`)}>
      <Avatar person={ds.people[id]} size={40} />
      <div>
        <div className="name">{personName(ds, id)}</div>
        <OweText balance={part} preferred={ds.prefs.currency} owesYou="deve a você" youOwe="você deve" />
        <GroupBreakdown friendId={id} sign={sign} />
      </div>
    </a>
  );
}

export function Dashboard() {
  const mobile = useIsMobile();
  const { ds, ledger } = useData();
  const ui = useUI();
  if (mobile) return <GroupsPage />;
  const entries = [...ledger.friendBalance.entries()].sort((a, b) =>
    personName(ds, a[0]).localeCompare(personName(ds, b[0]), "pt-BR"),
  );
  const owe = entries.filter(([, b]) => Object.values(b).some((v) => v < 0));
  const owed = entries.filter(([, b]) => Object.values(b).some((v) => v > 0));
  const pref = ds.prefs.currency;
  const noFriends = friendsOf(ds).length === 0;

  return (
    <Page title="Painel" actions={<MainActions />} right={<MonthSummary />}>
      <div className="summary-bar">
        <div>
          <div className="label">saldo total</div>
          <div className="value">
            <BalanceAmounts balance={ledger.total} preferred={pref} signed />
          </div>
        </div>
        <div>
          <div className="label">você deve</div>
          <div className="value">
            <BalanceAmounts balance={ledger.owe} preferred={pref} />
          </div>
        </div>
        <div>
          <div className="label">devem a você</div>
          <div className="value">
            <BalanceAmounts balance={ledger.owed} preferred={pref} />
          </div>
        </div>
      </div>

      {noFriends ? (
        <EmptyState icon={<Users size={48} />} title="Bem-vindo(a)!">
          Comece criando um grupo (casa, viagem, casal) ou adicionando um amigo.
          <div className="empty-actions">
            <button className="btn btn-orange" onClick={() => ui.open({ type: "group" })}>
              Criar um grupo
            </button>
            <button className="btn btn-mint" onClick={() => ui.open({ type: "friend" })}>
              <UserPlus size={16} /> Adicionar amigo
            </button>
          </div>
        </EmptyState>
      ) : isZero(ledger.total) && !owe.length && !owed.length ? (
        <EmptyState icon={<PartyPopper size={48} />} title="Você está quite com todo mundo!">
          Nenhuma conta pendente. Adicione uma despesa quando precisar dividir algo.
        </EmptyState>
      ) : (
        <div className="balance-cols">
          <div>
            <div className="col-title">Você deve</div>
            {owe.length === 0 && <div className="col-empty">Você não deve nada a ninguém.</div>}
            {owe.map(([id, b]) => (
              <FriendBalanceRow key={id} id={id} balance={b} sign={-1} />
            ))}
          </div>
          <div>
            <div className="col-title right">Devem a você</div>
            {owed.length === 0 && <div className="col-empty">Ninguém deve nada a você.</div>}
            {owed.map(([id, b]) => (
              <FriendBalanceRow key={id} id={id} balance={b} sign={1} />
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

/** Quadro da direita do painel: quanto você gastou (sua parte) neste mês. */
function MonthSummary() {
  const { ledger, me, ds } = useData();
  const month = todayISO().slice(0, 7);
  const spent: Balance = {};
  let count = 0;
  for (const e of ledger.active)
    if (!e.payment && e.date.startsWith(month) && e.owedBy[me]) {
      spent[e.currency] = (spent[e.currency] || 0) + e.owedBy[me];
      count++;
    }
  return (
    <div className="side-card">
      <div className="side-title">Este mês</div>
      <div className="side-big">
        <BalanceAmounts balance={spent} preferred={ds.prefs.currency} />
      </div>
      <div className="muted small">
        Sua parte em {count} despesa{count === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

/** Lista de grupos (aba "Grupos" no celular). */
export function GroupsPage() {
  const { ds, ledger, me } = useData();
  const ui = useUI();
  const groups = Object.values(ds.groups)
    .filter((g) => !g.deletedAt && g.memberIds.includes(me))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const nonGroup = ledger.myGroupBalance.get("") || {};
  const hasNonGroup = ledger.active.some((e) => !e.groupId);
  return (
    <Page title="Grupos" actions={<MainActions />} hideHeaderOnMobile>
      <OverallLine />
      <div className="card-list">
        {groups.map((g) => {
          const bal = ledger.myGroupBalance.get(g.id) || {};
          const debts = (ledger.debtsByGroup.get(g.id) || []).filter((d) => d.from === me || d.to === me);
          return (
            <a className="list-card" key={g.id} href={href(`/groups/${g.id}`)}>
              <GroupAvatar group={g} size={52} />
              <div className="list-card-body">
                <div className="name">{g.name}</div>
                <OweText balance={bal} preferred={g.currency} owesYou="você recebe" youOwe="você deve" settled="quite" />
                <div className="breakdown">
                  {debts.slice(0, 3).map((d, i) => (
                    <div key={i}>
                      {d.to === me ? (
                        <>
                          {personName(ds, d.from)} deve a você <span className="pos">{formatMoney(d.amount, d.currency)}</span>
                        </>
                      ) : (
                        <>
                          Você deve a {personName(ds, d.to)} <span className="neg">{formatMoney(d.amount, d.currency)}</span>
                        </>
                      )}
                    </div>
                  ))}
                  {debts.length > 3 && <div className="muted">e mais {debts.length - 3}…</div>}
                </div>
              </div>
            </a>
          );
        })}
        {hasNonGroup && (
          <a className="list-card" href={href("/nongroup")}>
            <GroupAvatar group={null} size={52} />
            <div className="list-card-body">
              <div className="name">Despesas sem grupo</div>
              <OweText balance={nonGroup} preferred={ds.prefs.currency} owesYou="você recebe" youOwe="você deve" />
            </div>
          </a>
        )}
      </div>
      {groups.length === 0 && (
        <EmptyState icon={<Users size={44} />} title="Nenhum grupo ainda">
          Grupos servem para dividir as contas da casa, de uma viagem ou de um casal.
        </EmptyState>
      )}
      <div className="center pad">
        <button className="btn btn-outline" onClick={() => ui.open({ type: "group" })}>
          <Users size={16} /> Criar um novo grupo
        </button>
      </div>
    </Page>
  );
}

/** Lista de amigos com saldos (aba "Amigos" no celular). */
export function FriendsPage() {
  const { ds, ledger } = useData();
  const ui = useUI();
  const friends = friendsOf(ds);
  const withBalance = [...ledger.friendBalance.keys()].filter((id) => ds.people[id]?.hidden && !isZero(ledger.friendBalance.get(id)!));
  return (
    <Page title="Amigos" actions={<MainActions />} hideHeaderOnMobile>
      <OverallLine />
      <div className="card-list">
        {[...friends.map((p) => p.id), ...withBalance].map((id) => {
          const bal = ledger.friendBalance.get(id) || {};
          return (
            <a className="list-card" key={id} href={href(`/friends/${encodeURIComponent(id)}`)}>
              <Avatar person={ds.people[id]} size={48} />
              <div className="list-card-body">
                <div className="name">{personName(ds, id)}</div>
                <OweText balance={bal} preferred={ds.prefs.currency} owesYou="deve a você" youOwe="você deve" />
                <GroupBreakdown friendId={id} />
              </div>
            </a>
          );
        })}
      </div>
      {friends.length === 0 && (
        <EmptyState icon={<UserPlus size={44} />} title="Nenhum amigo ainda">
          Adicione as pessoas com quem você divide despesas.
        </EmptyState>
      )}
      <div className="center pad">
        <button className="btn btn-outline" onClick={() => ui.open({ type: "friend" })}>
          <UserPlus size={16} /> Adicionar amigo
        </button>
      </div>
    </Page>
  );
}

/** "No geral, devem a você R$ X" no topo das listas do celular. */
function OverallLine() {
  const { ds, ledger } = useData();
  const pref = ds.prefs.currency;
  const t = ledger.total;
  let text;
  if (isZero(ledger.owe) && isZero(ledger.owed)) text = <>Você está quite com todo mundo.</>;
  else {
    const pos = Object.fromEntries(Object.entries(t).filter(([, v]) => v > 0));
    const neg = Object.fromEntries(Object.entries(t).filter(([, v]) => v < 0));
    text = (
      <>
        {!isZero(pos) && (
          <span>
            No geral, devem a você <BalanceAmounts balance={pos} preferred={pref} />
          </span>
        )}
        {!isZero(pos) && !isZero(neg) && <br />}
        {!isZero(neg) && (
          <span>
            No geral, você deve <BalanceAmounts balance={neg} preferred={pref} />
          </span>
        )}
        {isZero(t) && <span>Seus saldos se compensam: no total, você está quite.</span>}
      </>
    );
  }
  return <div className="overall-line">{text}</div>;
}
