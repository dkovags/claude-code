import { ChevronLeft, Calendar, Repeat as RepeatIcon, StickyNote, X } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { participants as expenseParticipants } from "../../domain/balances";
import { CATEGORY_GROUPS, DEFAULT_CATEGORY, categoryFullLabel, suggestCategory } from "../../domain/categories";
import { todayISO } from "../../domain/dates";
import { CURRENCIES, evaluateAmount, formatInput, formatMoney, parseAmount } from "../../domain/money";
import { friendsOf, isValidEmail, personName, who } from "../../domain/people";
import { REPEAT_LABELS } from "../../domain/recurring";
import { computeSplit, type SplitResult } from "../../domain/split";
import type { Cents, Dataset, Expense, ID, Repeat, SplitMode } from "../../domain/types";
import * as A from "../../store/actions";
import { Avatar, GroupAvatar, Modal } from "../components/basics";
import { useData, useRun, useUI } from "../context";
import { CategoryIcon, categoryIcon } from "../icons";

type View = "main" | "payer" | "split" | "category";
type Texts = Record<ID, string>;

const SPLIT_TABS: { mode: SplitMode; label: string; title: string }[] = [
  { mode: "equal", label: "=", title: "Igualmente" },
  { mode: "exact", label: "1,23", title: "Valores exatos" },
  { mode: "percent", label: "%", title: "Porcentagens" },
  { mode: "shares", label: "▤", title: "Partes" },
  { mode: "adjust", label: "+/−", title: "Ajuste" },
];

const SPLIT_PILL: Record<SplitMode, string> = {
  equal: "igualmente",
  exact: "por valores exatos",
  percent: "por porcentagens",
  shares: "por partes",
  adjust: "com ajustes",
};

function numText(n: number): string {
  return String(n).replace(".", ",");
}

function orderPeople(ds: Dataset, ids: ID[]): ID[] {
  const me = ds.meId;
  const rest = ids.filter((id) => id !== me).sort((a, b) => personName(ds, a).localeCompare(personName(ds, b), "pt-BR"));
  return ids.includes(me) ? [me, ...rest] : rest;
}

interface Init {
  groupId: ID | null;
  friends: ID[];
  description: string;
  category: string;
  amountText: string;
  currency: string;
  date: string;
  notes: string;
  repeat: Repeat;
  payerMode: "single" | "multi";
  payerId: ID;
  payerTexts: Texts;
  splitMode: SplitMode;
  excluded: ID[];
  splitTexts: Record<SplitMode, Texts>;
}

function initialState(ds: Dataset, e: Expense | undefined, groupId?: ID | null, friendId?: ID): Init {
  const me = ds.meId;
  const empty = { equal: {}, exact: {}, percent: {}, shares: {}, adjust: {} } as Record<SplitMode, Texts>;
  if (!e) {
    const g = groupId ? ds.groups[groupId] : null;
    return {
      groupId: g && !g.deletedAt ? g.id : null,
      friends: friendId ? [friendId] : [],
      description: "",
      category: DEFAULT_CATEGORY,
      amountText: "",
      currency: g?.currency || ds.prefs.currency,
      date: todayISO(),
      notes: "",
      repeat: "never",
      payerMode: "single",
      payerId: me,
      payerTexts: {},
      splitMode: "equal",
      excluded: [],
      splitTexts: empty,
    };
  }
  const ids = expenseParticipants(e);
  const payers = Object.keys(e.paidBy);
  const splitTexts = { ...empty };
  const vals = e.splitValues || (e.splitMode === "exact" ? e.owedBy : {});
  const texts: Texts = {};
  for (const [id, v] of Object.entries(vals))
    texts[id] = e.splitMode === "exact" || e.splitMode === "adjust" ? formatInput(v, e.currency) : numText(v);
  splitTexts[e.splitMode] = texts;
  const members = e.groupId ? ds.groups[e.groupId]?.memberIds || ids : ids;
  return {
    groupId: e.groupId,
    friends: e.groupId ? [] : ids.filter((id) => id !== me),
    description: e.description,
    category: e.category,
    amountText: formatInput(e.cost, e.currency),
    currency: e.currency,
    date: e.date,
    notes: e.notes || "",
    repeat: e.repeat,
    payerMode: payers.length > 1 ? "multi" : "single",
    payerId: payers.length === 1 ? payers[0] : me,
    payerTexts: Object.fromEntries(payers.map((id) => [id, formatInput(e.paidBy[id], e.currency)])),
    splitMode: e.splitMode,
    excluded: e.splitMode === "equal" ? members.filter((id) => !(id in e.owedBy)) : [],
    splitTexts,
  };
}

export function ExpenseDialog({
  expenseId,
  groupId: initialGroup,
  friendId,
  onClose,
}: {
  expenseId?: ID;
  groupId?: ID | null;
  friendId?: ID;
  onClose: () => void;
}) {
  const { ds, me } = useData();
  const runAction = useRun();
  const ui = useUI();
  const editing = expenseId ? ds.expenses[expenseId] : undefined;
  // estado inicial calculado uma única vez, ao abrir o formulário
  const [init] = useState(() => initialState(ds, editing, initialGroup, friendId));

  const [groupId, setGroupId] = useState<ID | null>(init.groupId);
  const [friends, setFriends] = useState<ID[]>(init.friends);
  const [description, setDescription] = useState(init.description);
  const [category, setCategory] = useState(init.category);
  const [categoryTouched, setCategoryTouched] = useState(!!editing);
  const [amountText, setAmountText] = useState(init.amountText);
  const [currency, setCurrency] = useState(init.currency);
  const [date, setDate] = useState(init.date);
  const [notes, setNotes] = useState(init.notes);
  const [repeat, setRepeat] = useState<Repeat>(init.repeat);
  const [payerMode, setPayerMode] = useState(init.payerMode);
  const [payerId, setPayerId] = useState<ID>(init.payerId);
  const [payerTexts, setPayerTexts] = useState<Texts>(init.payerTexts);
  const [splitMode, setSplitMode] = useState<SplitMode>(init.splitMode);
  const [excluded, setExcluded] = useState<ID[]>(init.excluded);
  const [splitTexts, setSplitTexts] = useState(init.splitTexts);
  const [view, setView] = useState<View>("main");
  const [showMore, setShowMore] = useState(!!init.notes || init.repeat !== "never");
  const [submitted, setSubmitted] = useState(false);

  const group = groupId ? ds.groups[groupId] : null;
  const people = useMemo(
    () => orderPeople(ds, group ? group.memberIds : [me, ...friends]),
    [ds, group, me, friends],
  );
  const cost = parseAmount(amountText, currency);
  const validCost = cost !== null && cost > 0 ? cost : null;
  const effectivePayer = people.includes(payerId) ? payerId : people[0];

  // quem pagou
  const paid = useMemo((): { map: Record<ID, Cents>; total: Cents } => {
    if (payerMode === "single") return { map: validCost ? { [effectivePayer]: validCost } : {}, total: validCost || 0 };
    const map: Record<ID, Cents> = {};
    let total = 0;
    for (const id of people) {
      const v = payerTexts[id] ? parseAmount(payerTexts[id], currency) : 0;
      if (v) {
        map[id] = v;
        total += v;
      }
    }
    return { map, total };
  }, [payerMode, validCost, effectivePayer, people, payerTexts, currency]);

  // divisão
  const included = people.filter((id) => !excluded.includes(id));
  const texts = splitTexts[splitMode];
  const values = useMemo(() => {
    const out: Record<ID, number> = {};
    for (const id of people) {
      const t = texts[id];
      if (!t) continue;
      const v = splitMode === "exact" || splitMode === "adjust" ? parseAmount(t, currency) : evaluateAmount(t);
      if (v !== null) out[id] = v;
    }
    return out;
  }, [people, texts, splitMode, currency]);
  const splitIds = splitMode === "equal" ? included : people;
  const split: SplitResult = validCost
    ? computeSplit(splitMode, validCost, splitIds, values)
    : { ok: false, error: "Informe o valor." };

  const payerError =
    payerMode === "multi" && validCost && paid.total !== validCost
      ? `O total pago (${formatMoney(paid.total, currency)}) precisa ser igual ao valor da despesa (${formatMoney(validCost, currency)}).`
      : null;

  const errors: string[] = [];
  if (!description.trim()) errors.push("Informe uma descrição.");
  if (!validCost) errors.push(amountText.trim() ? "Valor inválido." : "Informe o valor.");
  if (people.length < 2 && !group) errors.push("Escolha com quem você está dividindo.");
  if (payerError) errors.push(payerError);
  if (validCost && !split.ok) errors.push(split.error);

  const setText = (mode: SplitMode, id: ID, v: string) =>
    setSplitTexts((s) => ({ ...s, [mode]: { ...s[mode], [id]: v } }));

  const onDescription = (v: string) => {
    setDescription(v);
    if (!categoryTouched) setCategory(suggestCategory(v) || DEFAULT_CATEGORY);
  };

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    if (errors.length || !validCost || !split.ok) {
      if (payerError) setView("payer");
      else if (validCost && !split.ok) setView("split");
      return;
    }
    let splitValues: Record<ID, number> | undefined;
    if (splitMode !== "equal") {
      splitValues = {};
      for (const id of people) if (values[id]) splitValues[id] = values[id];
    }
    const input: A.ExpenseInput = {
      groupId,
      description,
      cost: validCost,
      currency,
      date,
      category,
      paidBy: paid.map,
      owedBy: split.shares,
      splitMode,
      splitValues,
      notes,
      repeat,
    };
    const id = runAction(A.saveExpense, input, expenseId);
    if (id !== undefined) {
      onClose();
      ui.toast(editing ? "Despesa atualizada." : "Despesa adicionada.");
    }
  };

  const title = editing ? "Editar despesa" : "Adicionar uma despesa";
  const footer = (
    <>
      <button type="button" className="btn btn-gray" onClick={onClose}>
        Cancelar
      </button>
      <button type="submit" form="expense-form" className="btn btn-mint">
        Salvar
      </button>
    </>
  );

  if (view === "category")
    return (
      <Modal title={<SubTitle text="Escolha uma categoria" onBack={() => setView("main")} />} onClose={onClose}>
        <div className="category-picker">
          {CATEGORY_GROUPS.map((g) => (
            <div key={g.key} className="category-group">
              <div className="section-title">{g.label}</div>
              <div className="category-items">
                {g.items.map((c) => {
                  const Icon = categoryIcon(c.key);
                  return (
                    <button
                      key={c.key}
                      className={`category-item ${c.key === category ? "selected" : ""}`}
                      onClick={() => {
                        setCategory(c.key);
                        setCategoryTouched(true);
                        setView("main");
                      }}
                    >
                      <span className="cat-icon" style={{ width: 28, height: 28, background: g.color }}>
                        <Icon size={16} />
                      </span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    );

  if (view === "payer")
    return (
      <Modal
        title={<SubTitle text="Quem pagou?" onBack={() => setView("main")} />}
        onClose={onClose}
        footer={
          <button className="btn btn-mint" onClick={() => setView("main")}>
            Concluir
          </button>
        }
      >
        <div className="choice-list">
          {people.map((id) => (
            <button
              key={id}
              className={`choice ${payerMode === "single" && effectivePayer === id ? "selected" : ""}`}
              onClick={() => {
                setPayerMode("single");
                setPayerId(id);
                setView("main");
              }}
            >
              <Avatar person={ds.people[id]} size={32} />
              <span>{who(ds, id, true)}</span>
            </button>
          ))}
          <button className={`choice ${payerMode === "multi" ? "selected" : ""}`} onClick={() => setPayerMode("multi")}>
            <span className="avatar multi" style={{ width: 32, height: 32 }}>
              +
            </span>
            <span>Várias pessoas</span>
          </button>
        </div>
        {payerMode === "multi" && (
          <div className="split-inputs">
            {people.map((id) => (
              <label className="split-row" key={id}>
                <Avatar person={ds.people[id]} size={28} />
                <span className="split-name">{who(ds, id, true)}</span>
                <span className="unit">{currencySymbol(currency)}</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={payerTexts[id] || ""}
                  onChange={(ev) => setPayerTexts({ ...payerTexts, [id]: ev.target.value })}
                />
              </label>
            ))}
            <div className={`split-total ${validCost && paid.total === validCost ? "ok" : "bad"}`}>
              {formatMoney(paid.total, currency)} de {formatMoney(validCost || 0, currency)}
              {validCost && paid.total !== validCost && (
                <span>
                  {" "}
                  · {paid.total < validCost ? "faltam" : "sobram"} {formatMoney(Math.abs(validCost - paid.total), currency)}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>
    );

  if (view === "split")
    return (
      <Modal
        title={<SubTitle text="Opções de divisão" onBack={() => setView("main")} />}
        onClose={onClose}
        footer={
          <button className="btn btn-mint" onClick={() => setView("main")}>
            Concluir
          </button>
        }
      >
        <div className="split-tabs" role="tablist">
          {SPLIT_TABS.map((t) => (
            <button
              key={t.mode}
              role="tab"
              aria-selected={splitMode === t.mode}
              title={t.title}
              className={`split-tab ${splitMode === t.mode ? "active" : ""}`}
              onClick={() => setSplitMode(t.mode)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="split-help">{splitHelp(splitMode)}</div>
        <div className="split-inputs">
          {people.map((id) => {
            const share = split.ok ? split.shares[id] || 0 : split.shares?.[id];
            if (splitMode === "equal") {
              const on = !excluded.includes(id);
              return (
                <label className="split-row" key={id}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setExcluded(on ? [...excluded, id] : excluded.filter((x) => x !== id))}
                  />
                  <Avatar person={ds.people[id]} size={28} />
                  <span className="split-name">{who(ds, id, true)}</span>
                  <span className="split-share">{on && share !== undefined ? formatMoney(share, currency) : ""}</span>
                </label>
              );
            }
            const unit = splitMode === "percent" ? "%" : splitMode === "shares" ? "parte(s)" : currencySymbol(currency);
            return (
              <label className="split-row" key={id}>
                <Avatar person={ds.people[id]} size={28} />
                <span className="split-name">
                  {who(ds, id, true)}
                  {splitMode !== "exact" && share !== undefined && split.ok && (
                    <small className="muted"> {formatMoney(share, currency)}</small>
                  )}
                </span>
                {splitMode === "adjust" && <span className="unit">+</span>}
                {splitMode !== "percent" && splitMode !== "shares" && <span className="unit">{unit}</span>}
                <input
                  inputMode="decimal"
                  placeholder={splitMode === "shares" ? "0" : splitMode === "percent" ? "0" : "0,00"}
                  value={texts[id] || ""}
                  onChange={(ev) => setText(splitMode, id, ev.target.value)}
                />
                {(splitMode === "percent" || splitMode === "shares") && <span className="unit">{unit}</span>}
              </label>
            );
          })}
        </div>
        <SplitTotal mode={splitMode} cost={validCost} currency={currency} values={values} ids={people} included={included} />
      </Modal>
    );

  return (
    <Modal title={title} onClose={onClose} footer={footer} className="expense-modal">
      <form id="expense-form" onSubmit={save} autoComplete="off">
        <ParticipantPicker
          groupId={groupId}
          friends={friends}
          onGroup={(g) => {
            if (g) {
              setGroupId(g);
              setFriends([]);
              setCurrency((c) => (amountText ? c : ds.groups[g]?.currency || c));
            } else {
              setFriends(group ? group.memberIds.filter((id) => id !== me && !ds.people[id]?.hidden) : friends);
              setGroupId(null);
            }
            setExcluded([]);
          }}
          onFriends={(f) => setFriends(f)}
        />

        <div className="expense-main">
          <button type="button" className="cat-button" onClick={() => setView("category")} title={categoryFullLabel(category)}>
            <CategoryIcon category={category} size={64} />
          </button>
          <div className="expense-fields">
            <input
              className="big-input desc-input"
              placeholder="Insira uma descrição"
              value={description}
              onChange={(ev) => onDescription(ev.target.value)}
              autoFocus={!editing}
              aria-label="Descrição"
            />
            <div className="amount-line">
              <select
                className="currency-select"
                value={currency}
                onChange={(ev) => setCurrency(ev.target.value)}
                aria-label="Moeda"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {currencySymbol(c.code)} {c.code}
                  </option>
                ))}
              </select>
              <input
                className="big-input amount-input"
                placeholder="0,00"
                inputMode="decimal"
                value={amountText}
                onChange={(ev) => setAmountText(ev.target.value)}
                aria-label="Valor"
              />
            </div>
            {/[+\-*/×÷()]/.test(amountText.replace(/^-/, "")) && validCost !== null && (
              <div className="calc-preview">= {formatMoney(validCost, currency)}</div>
            )}
          </div>
        </div>

        <div className="paid-split">
          Pago por{" "}
          <button type="button" className="pill" onClick={() => setView("payer")}>
            {payerMode === "multi" ? "várias pessoas" : who(ds, effectivePayer)}
          </button>{" "}
          e dividido{" "}
          <button type="button" className="pill" onClick={() => setView("split")}>
            {SPLIT_PILL[splitMode]}
          </button>
          .
          {splitMode === "equal" && validCost && included.length > 0 && (
            <div className="per-person">
              ({formatMoney(Math.floor(validCost / included.length), currency)}/pessoa)
            </div>
          )}
        </div>

        <div className="expense-extras">
          <label className="chip-field">
            <Calendar size={15} />
            <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} aria-label="Data" required />
          </label>
          <label className="chip-field">
            <GroupAvatar group={group} size={18} />
            <select
              value={groupId || ""}
              onChange={(ev) => {
                const g = ev.target.value || null;
                if (g) {
                  setGroupId(g);
                  setFriends([]);
                } else {
                  setFriends(group ? group.memberIds.filter((id) => id !== me) : friends);
                  setGroupId(null);
                }
                setExcluded([]);
              }}
              aria-label="Grupo"
            >
              <option value="">Sem grupo</option>
              {Object.values(ds.groups)
                .filter((g) => !g.deletedAt && g.memberIds.includes(me))
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className={`chip-field ${showMore ? "active" : ""}`} onClick={() => setShowMore(!showMore)}>
            <StickyNote size={15} /> Observações e repetição
          </button>
        </div>
        {showMore && (
          <div className="more-fields">
            <textarea
              placeholder="Observações"
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              rows={3}
              aria-label="Observações"
            />
            <label className="repeat-field">
              <RepeatIcon size={15} /> Repetir:
              <select value={repeat} onChange={(ev) => setRepeat(ev.target.value as Repeat)}>
                {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {submitted && errors.length > 0 && (
          <div className="form-errors" role="alert">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

function SubTitle({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <span className="subtitle">
      <button type="button" className="icon-btn light" onClick={onBack} aria-label="Voltar">
        <ChevronLeft size={20} />
      </button>
      {text}
    </span>
  );
}

function splitHelp(mode: SplitMode): string {
  switch (mode) {
    case "equal":
      return "Dividir igualmente entre as pessoas marcadas.";
    case "exact":
      return "Informe quanto cada pessoa deve.";
    case "percent":
      return "Informe a porcentagem de cada pessoa.";
    case "shares":
      return "Informe as partes de cada pessoa (por exemplo, 2 para um casal e 1 para quem está sozinho).";
    case "adjust":
      return "Informe quanto cada pessoa deve a mais; o restante é dividido igualmente.";
  }
}

function SplitTotal({
  mode,
  cost,
  currency,
  values,
  ids,
  included,
}: {
  mode: SplitMode;
  cost: Cents | null;
  currency: string;
  values: Record<ID, number>;
  ids: ID[];
  included: ID[];
}) {
  if (mode === "equal")
    return (
      <div className={`split-total ${included.length ? "ok" : "bad"}`}>
        {included.length
          ? cost
            ? `${formatMoney(Math.floor(cost / included.length), currency)} por pessoa (${included.length} pessoas)`
            : `${included.length} pessoas`
          : "Marque ao menos uma pessoa."}
      </div>
    );
  const sum = ids.reduce((s, id) => s + (values[id] || 0), 0);
  if (mode === "percent") {
    const ok = Math.abs(sum - 100) < 1e-6;
    return (
      <div className={`split-total ${ok ? "ok" : "bad"}`}>
        {numText(Math.round(sum * 100) / 100)}% de 100%
        {!ok && <span> · {sum < 100 ? "faltam" : "sobram"} {numText(Math.round(Math.abs(100 - sum) * 100) / 100)}%</span>}
      </div>
    );
  }
  if (mode === "shares") return <div className={`split-total ${sum > 0 ? "ok" : "bad"}`}>Total: {numText(sum)} parte(s)</div>;
  if (mode === "adjust") {
    const rest = (cost || 0) - sum;
    return (
      <div className={`split-total ${rest >= 0 ? "ok" : "bad"}`}>
        Ajustes: {formatMoney(sum, currency)} · restante dividido igualmente: {formatMoney(Math.max(rest, 0), currency)}
      </div>
    );
  }
  const ok = cost !== null && sum === cost;
  return (
    <div className={`split-total ${ok ? "ok" : "bad"}`}>
      {formatMoney(sum, currency)} de {formatMoney(cost || 0, currency)}
      {cost !== null && !ok && (
        <span>
          {" "}
          · {sum < cost ? "faltam" : "sobram"} {formatMoney(Math.abs(cost - sum), currency)}
        </span>
      )}
    </div>
  );
}

export function currencySymbol(code: string): string {
  try {
    const part = new Intl.NumberFormat("pt-BR", { style: "currency", currency: code })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value || code;
  } catch {
    return code;
  }
}

/** Campo "Com você e:" — escolha de amigos (com criação rápida) ou de um grupo. */
function ParticipantPicker({
  groupId,
  friends,
  onGroup,
  onFriends,
}: {
  groupId: ID | null;
  friends: ID[];
  onGroup: (g: ID | null) => void;
  onFriends: (f: ID[]) => void;
}) {
  const { ds, me } = useData();
  const runAction = useRun();
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const group = groupId ? ds.groups[groupId] : null;
  const q = text.trim().toLowerCase();
  const groups = Object.values(ds.groups).filter(
    (g) => !g.deletedAt && g.memberIds.includes(me) && (!q || g.name.toLowerCase().includes(q)),
  );
  const people = friendsOf(ds).filter(
    (p) => !friends.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || p.email?.includes(q)),
  );
  const exact = people.some((p) => p.name.toLowerCase() === q || p.email === q);

  const addNew = () => {
    const isEmail = isValidEmail(text);
    const name = isEmail ? text.split("@")[0] : text.trim();
    const id = runAction(A.addPerson, { name, email: isEmail ? text : undefined });
    if (id) {
      onFriends([...friends, id]);
      setText("");
    }
  };

  return (
    <div className="participants">
      <span className="with-label">
        Com <b>você</b> e:
      </span>
      <div className="token-field" onClick={() => inputRef.current?.focus()}>
        {group && (
          <span className="token group-token">
            <GroupAvatar group={group} size={18} />
            {group.name}
            <button type="button" aria-label="Remover grupo" onClick={() => onGroup(null)}>
              <X size={13} />
            </button>
          </span>
        )}
        {!group &&
          friends.map((id) => (
            <span className="token" key={id}>
              <Avatar person={ds.people[id]} size={18} />
              {personName(ds, id)}
              <button type="button" aria-label={`Remover ${personName(ds, id)}`} onClick={() => onFriends(friends.filter((x) => x !== id))}>
                <X size={13} />
              </button>
            </span>
          ))}
        {!group && (
          <input
            ref={inputRef}
            value={text}
            placeholder={friends.length ? "" : "Digite nomes, e-mails ou um grupo"}
            onChange={(ev) => setText(ev.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && text.trim()) {
                ev.preventDefault();
                if (people.length && q) {
                  onFriends([...friends, people[0].id]);
                  setText("");
                } else if (!exact) addNew();
              } else if (ev.key === "Backspace" && !text && friends.length) onFriends(friends.slice(0, -1));
            }}
            aria-label="Participantes"
          />
        )}
      </div>
      {focus && !group && (q || friends.length === 0) && (
        <div className="suggestions">
          {friends.length === 0 &&
            groups.slice(0, 5).map((g) => (
              <button
                type="button"
                key={g.id}
                className="suggestion"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onGroup(g.id);
                  setText("");
                }}
              >
                <GroupAvatar group={g} size={24} /> {g.name} <span className="muted">· grupo</span>
              </button>
            ))}
          {people.slice(0, 8).map((p) => (
            <button
              type="button"
              key={p.id}
              className="suggestion"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => {
                onFriends([...friends, p.id]);
                setText("");
              }}
            >
              <Avatar person={p} size={24} /> {p.name}
              {p.email && <span className="muted"> · {p.email}</span>}
            </button>
          ))}
          {q && !exact && (
            <button type="button" className="suggestion add" onMouseDown={(ev) => ev.preventDefault()} onClick={addNew}>
              + Adicionar “{text.trim()}” como amigo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
