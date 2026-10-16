import { MessageSquare, Repeat } from "lucide-react";
import { Fragment, useState } from "react";
import { payerText } from "../../domain/activity";
import { expenseFor, expensePairAmount } from "../../domain/balances";
import { dayTile, monthKey, monthLabel } from "../../domain/dates";
import { formatMoney } from "../../domain/money";
import { firstName, personName } from "../../domain/people";
import type { Dataset, Expense, ID } from "../../domain/types";
import { useData, useIsMobile, useUI } from "../context";
import { CategoryIcon } from "../icons";
import { ExpenseDetail } from "./ExpenseDetail";

export function paymentText(ds: Dataset, e: Expense): string {
  const from = Object.keys(e.paidBy)[0];
  const to = Object.keys(e.owedBy)[0];
  const name = (id: ID, cap: boolean) => (id === ds.meId ? (cap ? "Você" : "você") : personName(ds, id));
  return `${name(from, true)} pagou ${name(to, false)} ${formatMoney(e.cost, e.currency)}`;
}

/** Colunas da direita: "você pagou / Ana pagou" e "você emprestou / pegou emprestado". */
function RightColumns({ e, friendId }: { e: Expense; friendId?: ID }) {
  const { ds, me } = useData();
  if (e.payment) {
    const from = Object.keys(e.paidBy)[0];
    const to = Object.keys(e.owedBy)[0];
    let lbl = "não envolvido(a)";
    let cls = "zero";
    if (from === me) [lbl, cls] = ["você pagou", "pos"];
    else if (to === me) [lbl, cls] = ["você recebeu", "neg"];
    return (
      <>
        <div className="amt-col">
          <div className="lbl">{lbl}</div>
          {cls !== "zero" && <div className={`val ${cls}`}>{formatMoney(e.cost, e.currency)}</div>}
        </div>
      </>
    );
  }
  const f = expenseFor(e, me);
  let lbl: string;
  let cls: string;
  let value: number;
  if (friendId) {
    value = expensePairAmount(e, me, friendId);
    const fn = firstName(personName(ds, friendId));
    if (value > 0) [lbl, cls] = [`você emprestou a ${fn}`, "pos"];
    else if (value < 0) [lbl, cls] = [`${fn} te emprestou`, "neg"];
    else [lbl, cls] = ["sem saldo entre vocês", "zero"];
  } else {
    value = f.net;
    if (!f.involved) [lbl, cls] = ["não envolvido(a)", "zero"];
    else if (f.net > 0) [lbl, cls] = ["você emprestou", "pos"];
    else if (f.net < 0) [lbl, cls] = ["você pegou emprestado", "neg"];
    else [lbl, cls] = ["sem saldo", "zero"];
  }
  const payer = payerText(ds, e);
  return (
    <>
      <div className="amt-col only-wide-col">
        <div className="lbl">{payer === "você" ? "você pagou" : payer.endsWith("pessoas") ? `${payer} pagaram` : `${firstName(payer)} pagou`}</div>
        <div className="val">{formatMoney(e.cost, e.currency)}</div>
      </div>
      <div className="amt-col">
        <div className="lbl">{lbl}</div>
        {value !== 0 && <div className={`val ${cls}`}>{formatMoney(value, e.currency, { abs: true })}</div>}
      </div>
    </>
  );
}

export function ExpenseRow({
  e,
  friendId,
  showGroup,
  open,
  onClick,
}: {
  e: Expense;
  friendId?: ID;
  showGroup?: boolean;
  open?: boolean;
  onClick: () => void;
}) {
  const { ds } = useData();
  const t = dayTile(e.date);
  const group = e.groupId ? ds.groups[e.groupId] : null;
  const comments = e.comments.filter((c) => !c.deletedAt).length;
  return (
    <button className={`expense-row ${e.payment ? "payment" : ""} ${open ? "open" : ""}`} onClick={onClick}>
      <div className="date-tile">
        <div className="mon">{t.mon}</div>
        <div className="day">{t.day}</div>
      </div>
      <CategoryIcon category={e.category} size={e.payment ? 30 : 36} />
      <div className="desc">
        <div className="title">{e.payment ? paymentText(ds, e) : e.description}</div>
        <div className="meta">
          {showGroup && group && <span className="tag">{group.name}</span>}
          {e.repeat !== "never" && (
            <span className="meta-icon" title="Despesa recorrente">
              <Repeat size={12} />
            </span>
          )}
          {comments > 0 && (
            <span className="meta-icon" title={`${comments} comentário(s)`}>
              <MessageSquare size={12} /> {comments}
            </span>
          )}
        </div>
      </div>
      <RightColumns e={e} friendId={friendId} />
    </button>
  );
}

/** Lista de despesas agrupada por mês, com detalhes que abrem na própria lista (computador) ou em tela cheia (celular). */
export function ExpenseList({
  expenses,
  friendId,
  showGroup,
  pageSize = 60,
}: {
  expenses: Expense[];
  friendId?: ID;
  showGroup?: boolean;
  pageSize?: number;
}) {
  const [openId, setOpenId] = useState<ID | null>(null);
  const [limit, setLimit] = useState(pageSize);
  const mobile = useIsMobile();
  const ui = useUI();
  const shown = expenses.slice(0, limit);
  let lastMonth = "";
  return (
    <div className="expense-list">
      {shown.map((e) => {
        const mk = monthKey(e.date);
        const header = mk !== lastMonth;
        lastMonth = mk;
        return (
          <Fragment key={e.id}>
            {header && <div className="month-header">{monthLabel(mk)}</div>}
            <ExpenseRow
              e={e}
              friendId={friendId}
              showGroup={showGroup}
              open={openId === e.id}
              onClick={() => {
                if (mobile) ui.open({ type: "expenseDetail", expenseId: e.id });
                else setOpenId(openId === e.id ? null : e.id);
              }}
            />
            {!mobile && openId === e.id && (
              <div className="inline-detail">
                <ExpenseDetail expenseId={e.id} onDone={() => setOpenId(null)} />
              </div>
            )}
          </Fragment>
        );
      })}
      {expenses.length > limit && (
        <div className="list-more">
          <button className="btn btn-gray" onClick={() => setLimit(limit + pageSize)}>
            Mostrar mais ({expenses.length - limit})
          </button>
        </div>
      )}
    </div>
  );
}
