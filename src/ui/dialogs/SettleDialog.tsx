import { ArrowRight, ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import { groupKey } from "../../domain/balances";
import { todayISO } from "../../domain/dates";
import { CURRENCIES, currenciesOf, formatInput, formatMoney, parseAmount } from "../../domain/money";
import { personName, who } from "../../domain/people";
import type { Cents, ID } from "../../domain/types";
import * as A from "../../store/actions";
import { Avatar, Modal } from "../components/basics";
import { useData, useRun, useUI } from "../context";
import { currencySymbol } from "./ExpenseDialog";

interface Option {
  key: string;
  from: ID;
  to: ID;
  amount: Cents;
  currency: string;
  groupId: ID | null;
  /** Vários pagamentos (um por grupo) para zerar o saldo com a pessoa. */
  parts?: A.PaymentInput[];
  label: string;
}

/**
 * Acertar contas: primeiro mostra os saldos para escolher (como no app do Splitwise),
 * depois o formulário do pagamento.
 */
export function SettleDialog({
  groupId,
  friendId,
  paymentId,
  onClose,
}: {
  groupId?: ID | null;
  friendId?: ID;
  paymentId?: ID;
  onClose: () => void;
}) {
  const { ds, ledger, me } = useData();
  const runAction = useRun();
  const ui = useUI();
  const editing = paymentId ? ds.expenses[paymentId] : undefined;

  const options = useMemo((): Option[] => {
    const out: Option[] = [];
    const gname = (k: string) => (k ? ds.groups[k]?.name || "grupo" : "sem grupo");
    if (groupId !== undefined) {
      // dentro de um grupo: as dívidas do grupo, as minhas primeiro
      const debts = ledger.debtsByGroup.get(groupKey(groupId)) || [];
      const mine = debts.filter((d) => d.from === me || d.to === me);
      const others = debts.filter((d) => d.from !== me && d.to !== me);
      for (const d of [...mine, ...others])
        out.push({
          key: `${d.from}>${d.to}:${d.currency}`,
          ...d,
          groupId: groupId ?? null,
          label: `${who(ds, d.from, true)} deve a ${who(ds, d.to)}`,
        });
      return out;
    }
    const friends = friendId ? [friendId] : [...ledger.friendBalance.keys()];
    for (const f of friends) {
      const byGroup = ledger.friendByGroup.get(f);
      const bal = ledger.friendBalance.get(f) || {};
      for (const cur of currenciesOf(bal, ds.prefs.currency)) {
        const total = bal[cur];
        const parts: A.PaymentInput[] = [];
        for (const [k, b] of byGroup || []) {
          const v = b[cur];
          if (!v) continue;
          parts.push({
            from: v > 0 ? f : me,
            to: v > 0 ? me : f,
            amount: Math.abs(v),
            currency: cur,
            date: todayISO(),
            groupId: k || null,
          });
        }
        const sameDirection = parts.every((p) => p.from === (total > 0 ? f : me));
        out.push({
          key: `${f}:${cur}`,
          from: total > 0 ? f : me,
          to: total > 0 ? me : f,
          amount: Math.abs(total),
          currency: cur,
          groupId: parts.length === 1 ? parts[0].groupId : null,
          parts: parts.length > 1 && sameDirection ? parts : undefined,
          label:
            total > 0
              ? `${personName(ds, f)} deve a você`
              : `Você deve a ${personName(ds, f)}`,
        });
        if (friendId && parts.length > 1)
          for (const p of parts)
            out.push({
              key: `${f}:${cur}:${p.groupId || ""}`,
              ...p,
              label: `${p.from === me ? "Você deve" : `${personName(ds, f)} deve`} em “${gname(p.groupId || "")}”`,
            });
      }
    }
    return out;
  }, [ds, ledger, me, groupId, friendId]);

  const [step, setStep] = useState<"pick" | "form">(editing || options.length === 0 ? "form" : "pick");
  const [chosen, setChosen] = useState<Option | null>(null);

  const first = editing
    ? {
        from: Object.keys(editing.paidBy)[0],
        to: Object.keys(editing.owedBy)[0],
        amount: editing.cost,
        currency: editing.currency,
        groupId: editing.groupId,
      }
    : { from: me, to: friendId || "", amount: 0, currency: ds.prefs.currency, groupId: groupId ?? null };
  const [from, setFrom] = useState<ID>(first.from);
  const [to, setTo] = useState<ID>(first.to);
  const [amountText, setAmountText] = useState(first.amount ? formatInput(first.amount, first.currency) : "");
  const [currency, setCurrency] = useState(first.currency);
  const [date, setDate] = useState(editing?.date || todayISO());
  const [gid, setGid] = useState<ID | null>(first.groupId);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [splitParts, setSplitParts] = useState<A.PaymentInput[] | null>(null);

  const choose = (o: Option | null) => {
    setChosen(o);
    if (o) {
      setFrom(o.from);
      setTo(o.to);
      setAmountText(formatInput(o.amount, o.currency));
      setCurrency(o.currency);
      setGid(o.groupId);
      setSplitParts(o.parts || null);
    } else {
      setFrom(me);
      setTo(friendId || "");
      setAmountText("");
      setSplitParts(null);
      if (groupId !== undefined) setGid(groupId ?? null);
    }
    setStep("form");
  };

  const amount = parseAmount(amountText, currency);
  // pessoas possíveis: membros do grupo escolhido, ou todos os amigos
  const candidates = useMemo(() => {
    const g = gid ? ds.groups[gid] : null;
    const ids = g ? g.memberIds : Object.keys(ds.people).filter((id) => !ds.people[id].hidden || id === from || id === to);
    return [me, ...ids.filter((id) => id !== me).sort((a, b) => personName(ds, a).localeCompare(personName(ds, b), "pt-BR"))];
  }, [ds, gid, me, from, to]);
  const groupsForPair = Object.values(ds.groups).filter(
    (g) => !g.deletedAt && g.memberIds.includes(from) && g.memberIds.includes(to),
  );

  const amountChanged = chosen && amount !== chosen.amount;
  const useParts = splitParts && !amountChanged && chosen && from === chosen.from && to === chosen.to && currency === chosen.currency;

  const save = () => {
    if (!to || !from) return ui.toast("Escolha quem pagou e quem recebeu.", { kind: "error" });
    if (!amount || amount <= 0) return ui.toast("Informe o valor do pagamento.", { kind: "error" });
    let ok: unknown;
    if (editing) ok = runAction(A.updatePayment, editing.id, { from, to, amount, currency, date, groupId: gid, notes });
    else if (useParts) ok = runAction(A.recordPayments, splitParts!.map((p) => ({ ...p, date, notes })));
    else ok = runAction(A.recordPayments, [{ from, to, amount, currency, date, groupId: gid, notes }]);
    if (ok !== undefined) {
      onClose();
      ui.toast(editing ? "Pagamento atualizado." : "Pagamento registrado.");
    }
  };

  if (step === "pick")
    return (
      <Modal title="Acertar contas" onClose={onClose}>
        <div className="section-title">Escolha um saldo para quitar</div>
        <div className="choice-list">
          {options.map((o) => {
            const other = o.from === me ? o.to : o.from;
            return (
              <button key={o.key} className="choice settle-choice" onClick={() => choose(o)}>
                <Avatar person={ds.people[other]} size={36} />
                <span className="choice-text">
                  <span>{o.label}</span>
                  {o.parts && <small className="muted">em {o.parts.length} grupos</small>}
                </span>
                <span className={`amount ${o.to === me ? "pos" : o.from === me ? "neg" : "zero"}`}>
                  {formatMoney(o.amount, o.currency)}
                </span>
              </button>
            );
          })}
          <button className="choice" onClick={() => choose(null)}>
            <span className="avatar multi" style={{ width: 36, height: 36 }}>
              +
            </span>
            <span>Registrar outro pagamento</span>
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      title={editing ? "Editar pagamento" : "Registrar pagamento"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-gray" onClick={() => (editing || !options.length ? onClose() : setStep("pick"))}>
            {editing || !options.length ? "Cancelar" : "Voltar"}
          </button>
          <button className="btn btn-mint" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="settle-people">
        <div className="settle-person">
          <Avatar person={ds.people[from]} size={56} />
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Quem pagou">
            {candidates.map((id) => (
              <option key={id} value={id}>
                {who(ds, id, true)}
              </option>
            ))}
          </select>
        </div>
        <div className="settle-arrow">
          <ArrowRight size={28} />
          <button
            className="icon-btn"
            onClick={() => {
              setFrom(to || me);
              setTo(from);
            }}
            aria-label="Inverter"
            title="Inverter"
          >
            <ArrowLeftRight size={16} />
          </button>
        </div>
        <div className="settle-person">
          <Avatar person={ds.people[to]} size={56} />
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Quem recebeu">
            <option value="">Escolha…</option>
            {candidates
              .filter((id) => id !== from)
              .map((id) => (
                <option key={id} value={id}>
                  {who(ds, id, true)}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="settle-sentence">
        <b>{who(ds, from, true)}</b> pagou <b>{to ? who(ds, to) : "…"}</b>
      </div>
      <div className="amount-line center">
        <select className="currency-select" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Moeda">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {currencySymbol(c.code)} {c.code}
            </option>
          ))}
        </select>
        <input
          className="big-input amount-input"
          inputMode="decimal"
          placeholder="0,00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-label="Valor"
          autoFocus
        />
      </div>
      {useParts && (
        <div className="banner info">
          Serão registrados {splitParts!.length} pagamentos, um em cada grupo, zerando o saldo de vocês:
          <ul>
            {splitParts!.map((p) => (
              <li key={p.groupId || ""}>
                {p.groupId ? ds.groups[p.groupId]?.name : "Sem grupo"}: {formatMoney(p.amount, p.currency)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="expense-extras">
        <label className="chip-field">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" />
        </label>
        {!useParts && (
          <label className="chip-field">
            <select value={gid || ""} onChange={(e) => setGid(e.target.value || null)} aria-label="Grupo">
              <option value="">Sem grupo</option>
              {groupsForPair.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              {gid && !groupsForPair.some((g) => g.id === gid) && ds.groups[gid] && (
                <option value={gid}>{ds.groups[gid].name}</option>
              )}
            </select>
          </label>
        )}
      </div>
      <textarea
        className="notes-input"
        placeholder="Observações (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
      />
    </Modal>
  );
}
