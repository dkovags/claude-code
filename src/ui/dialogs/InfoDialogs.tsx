import { useMemo, useState } from "react";
import { groupKey } from "../../domain/balances";
import { CATEGORY_GROUPS, categoryColor, categoryOf } from "../../domain/categories";
import { addMonths, monthKey, monthLabel, todayISO } from "../../domain/dates";
import { addTo, currenciesOf, formatBalance, formatMoney } from "../../domain/money";
import { personName, who } from "../../domain/people";
import type { Balance, Expense, ID } from "../../domain/types";
import { Avatar, BalanceAmounts, Modal, OweText } from "../components/basics";
import { ExpenseDetail } from "../components/ExpenseDetail";
import { useData, useUI } from "../context";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      className="confirm-modal"
      footer={
        <>
          <button className="btn btn-gray" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-mint"}`}
            autoFocus
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-text">{message}</div>
    </Modal>
  );
}

export function ExpenseDetailDialog({ expenseId, onClose }: { expenseId: ID; onClose: () => void }) {
  const { ds } = useData();
  const e = ds.expenses[expenseId];
  return (
    <Modal title={e?.payment ? "Pagamento" : "Detalhes da despesa"} onClose={onClose} wide>
      <ExpenseDetail expenseId={expenseId} onDone={onClose} />
    </Modal>
  );
}

/** Saldos do grupo: o total de cada membro e quem deve a quem. */
export function BalancesDialog({ groupId, onClose }: { groupId: ID; onClose: () => void }) {
  const { ds, ledger, me } = useData();
  const ui = useUI();
  const group = ds.groups[groupId];
  if (!group) return null;
  const nets = ledger.netsByGroup.get(groupKey(groupId)) || {};
  const debts = ledger.debtsByGroup.get(groupKey(groupId)) || [];
  const balanceOf = (id: ID): Balance => {
    const b: Balance = {};
    for (const [cur, m] of Object.entries(nets)) if (m[id]) b[cur] = m[id];
    return b;
  };
  return (
    <Modal title={`Saldos – ${group.name}`} onClose={onClose} wide>
      {group.simplifyDebts && <div className="banner info">As dívidas deste grupo estão simplificadas.</div>}
      <div className="balances-list">
        {group.memberIds.map((id) => {
          const mine = debts.filter((d) => d.from === id || d.to === id);
          return (
            <div className="balance-block" key={id}>
              <div className="balance-head">
                <Avatar person={ds.people[id]} size={36} />
                <div>
                  <b>{who(ds, id, true)}</b>{" "}
                  <OweText
                    balance={balanceOf(id)}
                    preferred={group.currency}
                    owesYou="recebe no total"
                    youOwe="deve no total"
                    settled="está quite"
                  />
                </div>
              </div>
              {mine.map((d, i) => (
                <div className="debt-line" key={i}>
                  <span>
                    {who(ds, d.from, true)} deve{" "}
                    <b className={d.from === id ? "neg" : "pos"}>{formatMoney(d.amount, d.currency)}</b> a {who(ds, d.to)}
                  </span>
                  {(d.from === me || d.to === me) && d.from === id && (
                    <button className="link-btn" onClick={() => ui.open({ type: "settle", groupId })}>
                      acertar
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

type Period = "month" | "last" | "year" | "all";
const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Este mês" },
  { key: "last", label: "Mês passado" },
  { key: "year", label: "Este ano" },
  { key: "all", label: "Todo o período" },
];

function inPeriod(e: Expense, p: Period, today: string): boolean {
  const m = monthKey(today);
  if (p === "all") return true;
  if (p === "month") return monthKey(e.date) === m;
  if (p === "last") return monthKey(e.date) === monthKey(addMonths(today, -1));
  return e.date.slice(0, 4) === today.slice(0, 4);
}

function useScope(groupId: ID | null | undefined, friendId: ID | undefined): { title: string; expenses: Expense[] } {
  const { ds, ledger, me } = useData();
  return useMemo(() => {
    if (friendId)
      return {
        title: personName(ds, friendId),
        expenses: ledger.active.filter((e) => {
          const ids = [...Object.keys(e.paidBy), ...Object.keys(e.owedBy)];
          return ids.includes(friendId) && ids.includes(me);
        }),
      };
    if (groupId !== undefined)
      return {
        title: groupId ? ds.groups[groupId]?.name || "Grupo" : "Despesas sem grupo",
        expenses: ledger.active.filter((e) => e.groupId === groupId),
      };
    return { title: "Todas as despesas", expenses: ledger.active };
  }, [ds, ledger, me, groupId, friendId]);
}

/** "Totais", como no Splitwise: gasto do grupo, quanto você pagou, sua parte e pagamentos. */
export function TotalsDialog({ groupId, friendId, onClose }: { groupId?: ID | null; friendId?: ID; onClose: () => void }) {
  const { ds, me } = useData();
  const [period, setPeriod] = useState<Period>("month");
  const scope = useScope(groupId, friendId);
  const today = todayISO();
  const t = useMemo(() => {
    const spent: Balance = {};
    const youPaid: Balance = {};
    const share: Balance = {};
    const paymentsMade: Balance = {};
    const paymentsReceived: Balance = {};
    for (const e of scope.expenses) {
      if (!inPeriod(e, period, today)) continue;
      if (e.payment) {
        addTo(paymentsMade, e.currency, e.paidBy[me] || 0);
        addTo(paymentsReceived, e.currency, e.owedBy[me] || 0);
      } else {
        addTo(spent, e.currency, e.cost);
        addTo(youPaid, e.currency, e.paidBy[me] || 0);
        addTo(share, e.currency, e.owedBy[me] || 0);
      }
    }
    const change: Balance = {};
    for (const b of [youPaid, paymentsMade]) for (const [c, v] of Object.entries(b)) addTo(change, c, v);
    for (const b of [share, paymentsReceived]) for (const [c, v] of Object.entries(b)) addTo(change, c, -v);
    return { spent, youPaid, share, paymentsMade, paymentsReceived, change };
  }, [scope, period, me, today]);

  const row = (label: string, b: Balance, colored = false) => (
    <div className="total-row">
      <span>{label}</span>
      <span className="total-val">
        {colored ? <BalanceAmounts balance={b} signed /> : formatBalance(b, { preferred: ds.prefs.currency })}
      </span>
    </div>
  );
  return (
    <Modal title={`Totais – ${scope.title}`} onClose={onClose}>
      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button key={p.key} className={`period-tab ${period === p.key ? "active" : ""}`} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="totals">
        {row(friendId ? "Total das despesas em comum" : groupId !== undefined ? "Gasto total do grupo" : "Gasto total", t.spent)}
        {row("Total que você pagou", t.youPaid)}
        {row("Sua parte nas despesas", t.share)}
        {row("Pagamentos que você fez", t.paymentsMade)}
        {row("Pagamentos que você recebeu", t.paymentsReceived)}
        {row("Variação do seu saldo", t.change, true)}
      </div>
    </Modal>
  );
}

/** Gráficos: gastos por categoria e por mês. */
export function ChartsDialog({ groupId, friendId, onClose }: { groupId?: ID | null; friendId?: ID; onClose: () => void }) {
  const { ds, me } = useData();
  const [period, setPeriod] = useState<Period>("all");
  const [mode, setMode] = useState<"share" | "total">("share");
  const scope = useScope(groupId, friendId);
  const today = todayISO();
  const list = scope.expenses.filter((e) => !e.payment);
  const value = (e: Expense) => (mode === "share" ? e.owedBy[me] || 0 : e.cost);
  // usa a moeda com mais despesas
  const counts: Record<string, number> = {};
  for (const e of list) counts[e.currency] = (counts[e.currency] || 0) + 1;
  const currency = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ds.prefs.currency;

  const catMap = new Map<string, number>();
  for (const e of list)
    if (e.currency === currency && inPeriod(e, period, today)) {
      const parent = categoryOf(e.category).parent;
      catMap.set(parent, (catMap.get(parent) || 0) + value(e));
    }
  const byCategory = [...catMap.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) monthKeys.push(monthKey(addMonths(today, -i)));
  const monthMap = new Map(monthKeys.map((k) => [k, 0]));
  for (const e of list) {
    const k = monthKey(e.date);
    if (e.currency === currency && monthMap.has(k)) monthMap.set(k, monthMap.get(k)! + value(e));
  }
  const months = [...monthMap.entries()];

  const totalCat = byCategory.reduce((s, [, v]) => s + v, 0);
  const maxMonth = Math.max(1, ...months.map(([, v]) => v));
  const groupLabel = (k: string) => CATEGORY_GROUPS.find((g) => g.key === k)?.label || k;
  const groupColor = (k: string) => categoryColor(CATEGORY_GROUPS.find((g) => g.key === k)?.items[0].key || "");
  const otherCurrencies = currenciesOf(counts).filter((c) => c !== currency);

  return (
    <Modal title={`Gráficos – ${scope.title}`} onClose={onClose} wide>
      <div className="chart-controls">
        <div className="period-tabs">
          <button className={`period-tab ${mode === "share" ? "active" : ""}`} onClick={() => setMode("share")}>
            Sua parte
          </button>
          <button className={`period-tab ${mode === "total" ? "active" : ""}`} onClick={() => setMode("total")}>
            {groupId !== undefined || friendId ? "Total" : "Valor total"}
          </button>
        </div>
      </div>
      <div className="section-title">Gastos por categoria</div>
      <div className="period-tabs">
        {PERIODS.map((p) => (
          <button key={p.key} className={`period-tab ${period === p.key ? "active" : ""}`} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {byCategory.length === 0 ? (
        <div className="muted pad">Nenhum gasto neste período.</div>
      ) : (
        <div className="bars">
          {byCategory.map(([k, v]) => (
            <div className="bar-row" key={k}>
              <span className="bar-label">{groupLabel(k)}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(v / byCategory[0][1]) * 100}%`, background: groupColor(k) }} />
              </span>
              <span className="bar-value">
                {formatMoney(v, currency)} <small className="muted">{Math.round((v / totalCat) * 100)}%</small>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="section-title">Últimos 12 meses</div>
      <div className="month-chart" role="img" aria-label="Gastos por mês">
        {months.map(([k, v]) => (
          <div className="month-col" key={k} title={`${monthLabel(k)}: ${formatMoney(v, currency)}`}>
            <span className="month-val">{v ? formatMoney(v, currency).replace(/,\d+$/, "") : ""}</span>
            <span className="month-bar" style={{ height: `${(v / maxMonth) * 100}%` }} />
            <span className="month-name">{monthLabel(k).slice(0, 3)}</span>
          </div>
        ))}
      </div>
      {otherCurrencies.length > 0 && (
        <div className="muted small pad">Mostrando valores em {currency}. Há também despesas em {otherCurrencies.join(", ")}.</div>
      )}
    </Modal>
  );
}
