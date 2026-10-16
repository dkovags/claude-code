import { Flag, RotateCcw, UserPlus, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { buildFeed, type FeedItem } from "../../domain/activity";
import { expenseFor } from "../../domain/balances";
import { relativeTime } from "../../domain/dates";
import { formatMoney } from "../../domain/money";
import { who } from "../../domain/people";
import type { Dataset, Expense, ID } from "../../domain/types";
import * as A from "../../store/actions";
import { Avatar, EmptyState, GroupAvatar } from "../components/basics";
import { Page } from "../components/Shell";
import { useData, useRun, useUI } from "../context";
import { CategoryIcon } from "../icons";
import { navigate } from "../router";

const q = (s: string) => `“${s}”`;

function inGroup(ds: Dataset, e: Expense): ReactNode {
  if (!e.groupId) return null;
  return <> em {q(ds.groups[e.groupId]?.name || "grupo")}</>;
}

/** Efeito da despesa para você: "Você recebe R$ X" / "Você deve R$ X". */
function Effect({ e, me }: { e: Expense; me: ID }) {
  if (e.payment) {
    const from = Object.keys(e.paidBy)[0];
    const to = Object.keys(e.owedBy)[0];
    if (from === me) return <div className="effect pos">Você pagou {formatMoney(e.cost, e.currency)}</div>;
    if (to === me) return <div className="effect neg">Você recebeu {formatMoney(e.cost, e.currency)}</div>;
    return null;
  }
  const f = expenseFor(e, me);
  if (!f.involved) return <div className="effect zero">Você não está envolvido(a)</div>;
  if (f.net > 0) return <div className="effect pos">Você recebe {formatMoney(f.net, e.currency)}</div>;
  if (f.net < 0) return <div className="effect neg">Você deve {formatMoney(-f.net, e.currency)}</div>;
  return <div className="effect zero">Sem saldo para você</div>;
}

function itemText(ds: Dataset, item: FeedItem): ReactNode {
  const actor = <b>{who(ds, item.by, true)}</b>;
  if (item.kind === "friend") return <>{actor} adicionou <b>{item.person.name}</b> aos amigos.</>;
  if (item.kind === "comment")
    return (
      <>
        {actor} comentou em <b>{q(item.expense.payment ? "Pagamento" : item.expense.description)}</b>: {q(item.comment.text)}
      </>
    );
  if (item.kind === "group") {
    const g = <b>{q(item.group.name)}</b>;
    const person = item.entry.personId ? <b>{who(ds, item.entry.personId)}</b> : null;
    switch (item.entry.type) {
      case "created":
        return <>{actor} criou o grupo {g}.</>;
      case "updated":
        return (
          <>
            {actor} atualizou o grupo {g}
            {item.entry.changes?.length ? `: ${item.entry.changes.join("; ")}` : ""}.
          </>
        );
      case "deleted":
        return <>{actor} excluiu o grupo {g}.</>;
      case "restored":
        return <>{actor} restaurou o grupo {g}.</>;
      case "member_added":
        return item.entry.personId === item.by ? <>{actor} entrou no grupo {g}.</> : <>{actor} adicionou {person} ao grupo {g}.</>;
      case "member_removed":
        return item.entry.personId === item.by ? <>{actor} saiu do grupo {g}.</> : <>{actor} removeu {person} do grupo {g}.</>;
    }
  }
  if (item.kind === "expense") {
    const e = item.expense;
    if (e.payment) {
      const from = Object.keys(e.paidBy)[0];
      const to = Object.keys(e.owedBy)[0];
      const pay = (
        <>
          <b>{who(ds, from, true)}</b> pagou <b>{who(ds, to)}</b> {formatMoney(e.cost, e.currency)}
        </>
      );
      switch (item.entry.type) {
        case "created":
          return from === item.by ? (
            <>
              {actor} pagou <b>{who(ds, to)}</b> {formatMoney(e.cost, e.currency)}
              {inGroup(ds, e)}.
            </>
          ) : (
            <>
              {actor} registrou um pagamento: {pay}
              {inGroup(ds, e)}.
            </>
          );
        case "updated":
          return <>{actor} alterou um pagamento: {pay}.</>;
        case "deleted":
          return <>{actor} excluiu um pagamento: {pay}.</>;
        case "restored":
          return <>{actor} restaurou um pagamento: {pay}.</>;
      }
    }
    const d = <b>{q(e.description)}</b>;
    switch (item.entry.type) {
      case "created":
        return item.entry.auto ? (
          <>
            A despesa recorrente {d} foi adicionada automaticamente{inGroup(ds, e)}.
          </>
        ) : (
          <>
            {actor} adicionou {d}
            {inGroup(ds, e)}.
          </>
        );
      case "updated":
        return (
          <>
            {actor} atualizou {d}
            {inGroup(ds, e)}
            {item.entry.changes?.length ? <span className="muted"> ({item.entry.changes.join("; ")})</span> : null}.
          </>
        );
      case "deleted":
        return (
          <>
            {actor} excluiu {d}
            {inGroup(ds, e)}.
          </>
        );
      case "restored":
        return (
          <>
            {actor} restaurou {d}
            {inGroup(ds, e)}.
          </>
        );
    }
  }
  return null;
}

function ItemIcon({ item }: { item: FeedItem }) {
  const { ds } = useData();
  if (item.kind === "expense" || item.kind === "comment")
    return (
      <span className="feed-icon">
        <CategoryIcon category={item.expense.category} size={40} />
        <span className="feed-actor">
          <Avatar person={ds.people[item.by]} size={20} />
        </span>
      </span>
    );
  if (item.kind === "group")
    return (
      <span className="feed-icon">
        <GroupAvatar group={item.group} size={40} />
        <span className="feed-actor">
          <Avatar person={ds.people[item.by]} size={20} />
        </span>
      </span>
    );
  return (
    <span className="feed-icon">
      <Avatar person={item.person} size={40} />
      <span className="feed-actor plus">
        <UserPlus size={12} />
      </span>
    </span>
  );
}

export function ActivityPage() {
  const { ds, me } = useData();
  const ui = useUI();
  const runAction = useRun();
  const [limit, setLimit] = useState(80);
  const feed = buildFeed(ds);
  const open = (item: FeedItem) => {
    if (item.kind === "expense" || item.kind === "comment") ui.open({ type: "expenseDetail", expenseId: item.expense.id });
    else if (item.kind === "group") navigate(`/groups/${item.group.id}`);
    else navigate(`/friends/${item.person.id}`);
  };
  return (
    <Page title="Atividade recente" icon={<Flag size={22} className="muted" />} hideHeaderOnMobile>
      <div className="mobile-title only-mobile">Atividade recente</div>
      {feed.length === 0 && (
        <EmptyState icon={<Users size={44} />} title="Nenhuma atividade ainda">
          Tudo o que acontecer nos seus grupos e despesas aparece aqui.
        </EmptyState>
      )}
      <div className="feed">
        {feed.slice(0, limit).map((item) => {
          const showRestore =
            (item.kind === "expense" && item.entry.type === "deleted" && item.expense.deletedAt) ||
            (item.kind === "group" && item.entry.type === "deleted" && item.group.deletedAt);
          return (
            <div className="feed-item" key={item.key} onClick={() => open(item)} role="button" tabIndex={0}>
              <ItemIcon item={item} />
              <div className="feed-body">
                <div className="feed-text">{itemText(ds, item)}</div>
                {item.kind === "expense" && item.entry.type !== "deleted" && <Effect e={item.expense} me={me} />}
                <div className="feed-time">{relativeTime(item.ts)}</div>
              </div>
              {showRestore && (
                <button
                  className="btn btn-gray btn-sm"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (item.kind === "expense") runAction(A.restoreExpense, item.expense.id);
                    else if (item.kind === "group") runAction(A.restoreGroup, item.group.id);
                  }}
                >
                  <RotateCcw size={14} /> Desfazer
                </button>
              )}
            </div>
          );
        })}
      </div>
      {feed.length > limit && (
        <div className="list-more">
          <button className="btn btn-gray" onClick={() => setLimit(limit + 80)}>
            Mostrar mais
          </button>
        </div>
      )}
    </Page>
  );
}
