import { describeExpenseChanges, describeGroupChanges } from "../domain/activity";
import { buildLedger, memberBalance, participants } from "../domain/balances";
import { DEFAULT_CATEGORY, PAYMENT_CATEGORY } from "../domain/categories";
import { isValidISODate } from "../domain/dates";
import { formatBalance, isZero } from "../domain/money";
import { colorFor, findPersonByEmail, isValidEmail, normalizeEmail, personName } from "../domain/people";
import { dueRecurring } from "../domain/recurring";
import { nonZero } from "../domain/split";
import type {
  Cents, Comment, Dataset, Expense, Group, GroupType, HistoryEntry, ID, Person, Prefs, Repeat, SplitMode,
} from "../domain/types";
import type { Op } from "./ops";
import { emailId, renamePersonOps } from "./rename";

export interface Ctx {
  me: ID;
  now: string;
  today: string;
  id: (prefix?: string) => string;
}

export interface Result<T = void> {
  ops: Op[];
  value: T;
}

/** Erro de validação com mensagem pronta para mostrar ao usuário. */
export class UserError extends Error {}

const fail = (msg: string): never => {
  throw new UserError(msg);
};

const entry = (ctx: Ctx, type: HistoryEntry["type"], extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  ts: ctx.now,
  by: ctx.me,
  type,
  ...extra,
});

/* ---------------- pessoas ---------------- */

export function addPerson(ds: Dataset, ctx: Ctx, input: { name: string; email?: string; pix?: string }): Result<ID> {
  const name = input.name.trim();
  if (!name) fail("Informe o nome.");
  const email = normalizeEmail(input.email);
  if (email && !isValidEmail(email)) fail("E-mail inválido.");
  if (email) {
    const existing = findPersonByEmail(ds, email);
    if (existing) {
      if (existing.id === ds.meId) fail("Esse é o seu próprio e-mail.");
      if (existing.hidden) return { ops: [{ t: "person", prev: existing, next: { ...existing, hidden: false } }], value: existing.id };
      fail(`${existing.name} já está na sua lista de amigos.`);
    }
  }
  const id = email ? emailId(email) : ctx.id("p_");
  if (ds.people[id]) fail("Essa pessoa já existe.");
  const person: Person = { id, name, color: colorFor(id), createdAt: ctx.now, createdBy: ctx.me };
  if (email) person.email = email;
  const pix = input.pix?.trim();
  if (pix) person.pix = pix.slice(0, 140);
  return { ops: [{ t: "person", next: person }], value: id };
}

/** Edita nome e e-mail. Quem ganha (ou troca) o e-mail passa a ser identificado por ele em todos os registros. */
export function updatePerson(
  ds: Dataset,
  _ctx: Ctx,
  id: ID,
  input: { name: string; email?: string; pix?: string },
): Result<ID> {
  const prev = ds.people[id] ?? fail("Pessoa não encontrada.");
  const name = input.name.trim();
  if (!name) fail("Informe o nome.");
  const email = normalizeEmail(input.email);
  if (email && !isValidEmail(email)) fail("E-mail inválido.");
  if (email) {
    const other = findPersonByEmail(ds, email);
    if (other && other.id !== id) fail(`Esse e-mail já é de ${other.name}.`);
  }
  const next: Person = { ...prev, name };
  if (email) next.email = email;
  else delete next.email;
  if (input.pix !== undefined) {
    const pix = input.pix.trim();
    if (pix.length > 140) fail("Chave Pix muito longa.");
    if (pix) next.pix = pix;
    else delete next.pix;
  }
  if (next.name === prev.name && next.email === prev.email && next.pix === prev.pix) return { ops: [], value: id };
  const newId = email && email !== prev.email ? emailId(email) : id;
  if (newId === id) return { ops: [{ t: "person", prev, next }], value: id };
  if (ds.people[newId]) fail("Já existe uma pessoa com esse e-mail.");
  const ops: Op[] = [
    { t: "removePerson", id },
    { t: "person", next: { ...next, id: newId } },
    ...renamePersonOps(ds, id, newId),
  ];
  if (id === ds.meId) ops.push({ t: "meId", id: newId });
  return { ops, value: newId };
}

/** Remove (ou devolve) alguém da lista de amigos. Só é possível remover quem está quite. */
export function setFriendHidden(ds: Dataset, _ctx: Ctx, id: ID, hidden: boolean): Result {
  const prev = ds.people[id] ?? fail("Pessoa não encontrada.");
  if (id === ds.meId) fail("Você não pode remover a si mesmo.");
  if (hidden) {
    const bal = buildLedger(ds).friendBalance.get(id) || {};
    if (!isZero(bal))
      fail(`Vocês ainda têm saldo em aberto (${formatBalance(bal, { abs: true })}). Acertem as contas antes de remover.`);
  }
  return { ops: [{ t: "person", prev, next: { ...prev, hidden } }], value: undefined };
}

/* ---------------- grupos ---------------- */

export interface GroupInput {
  name: string;
  type: GroupType;
  currency: string;
  simplifyDebts: boolean;
  memberIds: ID[];
}

export function createGroup(ds: Dataset, ctx: Ctx, input: GroupInput): Result<ID> {
  const name = input.name.trim();
  if (!name) fail("Dê um nome ao grupo.");
  const memberIds = [ctx.me, ...input.memberIds.filter((id) => id !== ctx.me)];
  for (const id of memberIds) if (!ds.people[id]) fail("Membro desconhecido.");
  const id = ctx.id("g_");
  const group: Group = {
    id,
    name,
    type: input.type,
    currency: input.currency,
    simplifyDebts: input.simplifyDebts,
    memberIds: [...new Set(memberIds)],
    createdAt: ctx.now,
    createdBy: ctx.me,
    history: [entry(ctx, "created")],
  };
  return { ops: [{ t: "group", next: group }], value: id };
}

export function updateGroup(
  ds: Dataset,
  ctx: Ctx,
  id: ID,
  patch: Partial<Pick<Group, "name" | "type" | "currency" | "simplifyDebts">>,
): Result {
  const prev = ds.groups[id] ?? fail("Grupo não encontrado.");
  const next: Group = { ...prev, ...patch };
  next.name = next.name.trim();
  if (!next.name) fail("Dê um nome ao grupo.");
  const changes = describeGroupChanges(prev, next);
  if (!changes.length) return { ops: [], value: undefined };
  next.history = [...prev.history, entry(ctx, "updated", { changes })];
  return { ops: [{ t: "group", prev, next }], value: undefined };
}

export function addMembers(ds: Dataset, ctx: Ctx, groupId: ID, personIds: ID[]): Result {
  const prev = ds.groups[groupId] ?? fail("Grupo não encontrado.");
  const added = personIds.filter((id) => !prev.memberIds.includes(id));
  if (!added.length) return { ops: [], value: undefined };
  for (const id of added) if (!ds.people[id]) fail("Pessoa desconhecida.");
  const next: Group = {
    ...prev,
    memberIds: [...prev.memberIds, ...added],
    history: [...prev.history, ...added.map((personId) => entry(ctx, "member_added", { personId }))],
  };
  return { ops: [{ t: "group", prev, next }], value: undefined };
}

/** Remove um membro (ou sai do grupo). Como no Splitwise, só quem está com saldo zero no grupo. */
export function removeMember(ds: Dataset, ctx: Ctx, groupId: ID, personId: ID): Result {
  const prev = ds.groups[groupId] ?? fail("Grupo não encontrado.");
  if (!prev.memberIds.includes(personId)) return { ops: [], value: undefined };
  const bal = memberBalance(buildLedger(ds), groupId, personId);
  if (!isZero(bal)) {
    if (personId === ds.meId) fail("Você ainda tem saldo neste grupo. Acerte as contas antes de sair.");
    fail(`${personName(ds, personId)} ainda tem saldo neste grupo. Acertem as contas antes de remover.`);
  }
  const next: Group = {
    ...prev,
    memberIds: prev.memberIds.filter((id) => id !== personId),
    history: [...prev.history, entry(ctx, "member_removed", { personId })],
  };
  return { ops: [{ t: "group", prev, next }], value: undefined };
}

export function deleteGroup(ds: Dataset, ctx: Ctx, id: ID): Result {
  const prev = ds.groups[id] ?? fail("Grupo não encontrado.");
  if (prev.deletedAt) return { ops: [], value: undefined };
  const next: Group = { ...prev, deletedAt: ctx.now, deletedBy: ctx.me, history: [...prev.history, entry(ctx, "deleted")] };
  return { ops: [{ t: "group", prev, next }], value: undefined };
}

export function restoreGroup(ds: Dataset, ctx: Ctx, id: ID): Result {
  const prev = ds.groups[id] ?? fail("Grupo não encontrado.");
  if (!prev.deletedAt) return { ops: [], value: undefined };
  const next: Group = { ...prev, history: [...prev.history, entry(ctx, "restored")] };
  delete next.deletedAt;
  delete next.deletedBy;
  return { ops: [{ t: "group", prev, next }], value: undefined };
}

/* ---------------- despesas ---------------- */

export interface ExpenseInput {
  groupId: ID | null;
  description: string;
  cost: Cents;
  currency: string;
  date: string;
  category: string;
  paidBy: Record<ID, Cents>;
  owedBy: Record<ID, Cents>;
  splitMode: SplitMode;
  splitValues?: Record<ID, number>;
  notes?: string;
  repeat: Repeat;
}

function validateExpense(ds: Dataset, input: ExpenseInput, payment: boolean, prev?: Expense): void {
  if (!payment && !input.description.trim()) fail("Informe uma descrição.");
  if (!Number.isInteger(input.cost) || input.cost <= 0) fail("Informe um valor maior que zero.");
  if (!isValidISODate(input.date)) fail("Data inválida.");
  const paid = Object.values(input.paidBy).reduce((a, b) => a + b, 0);
  const owed = Object.values(input.owedBy).reduce((a, b) => a + b, 0);
  if (Object.values(input.paidBy).some((v) => !Number.isInteger(v) || v < 0)) fail("Valores pagos inválidos.");
  if (Object.values(input.owedBy).some((v) => !Number.isInteger(v) || v < 0)) fail("Valores da divisão inválidos.");
  if (paid !== input.cost) fail("O total pago precisa ser igual ao valor da despesa.");
  if (owed !== input.cost) fail("A soma da divisão precisa ser igual ao valor da despesa.");
  const ids = [...Object.keys(input.paidBy), ...Object.keys(input.owedBy)];
  for (const id of ids) if (!ds.people[id]) fail("Pessoa desconhecida na despesa.");
  if (input.groupId) {
    const g = ds.groups[input.groupId] ?? fail("Grupo não encontrado.");
    if (g.deletedAt) fail("Este grupo foi excluído.");
    // quem saiu do grupo continua nas despesas antigas e pode continuar nelas ao editar
    const kept = prev && prev.groupId === input.groupId ? participants(prev) : [];
    for (const id of ids)
      if (!g.memberIds.includes(id) && !kept.includes(id)) fail(`${personName(ds, id)} não participa deste grupo.`);
  }
}

function cleanInput(input: ExpenseInput): ExpenseInput {
  return {
    ...input,
    description: input.description.trim(),
    notes: input.notes?.trim() || undefined,
    paidBy: nonZero(input.paidBy),
    owedBy: nonZero(input.owedBy),
  };
}

/** Cria (sem id) ou edita (com id) uma despesa. */
export function saveExpense(ds: Dataset, ctx: Ctx, raw: ExpenseInput, id?: ID): Result<ID> {
  const input = cleanInput(raw);
  if (!id) {
    validateExpense(ds, input, false);
    const newIdValue = ctx.id("e_");
    const e: Expense = {
      id: newIdValue,
      payment: false,
      ...input,
      category: input.category || DEFAULT_CATEGORY,
      createdAt: ctx.now,
      createdBy: ctx.me,
      history: [entry(ctx, "created")],
      comments: [],
    };
    if (!e.notes) delete e.notes;
    if (!e.splitValues) delete e.splitValues;
    if (e.repeat !== "never") Object.assign(e, { seriesId: newIdValue, seriesStart: e.date, seriesIndex: 0 });
    return { ops: [{ t: "expense", next: e }], value: newIdValue };
  }
  const prev = ds.expenses[id] ?? fail("Despesa não encontrada.");
  validateExpense(ds, input, prev.payment, prev);
  const next: Expense = { ...prev, ...input };
  if (!next.notes) delete next.notes;
  if (!input.splitValues) delete next.splitValues;
  if (next.repeat !== prev.repeat || next.date !== prev.date) {
    if (next.repeat === "never") {
      delete next.seriesStart;
      delete next.seriesIndex;
    } else {
      next.seriesId = prev.seriesId ?? prev.id;
      next.seriesStart = next.date;
      next.seriesIndex = 0;
      if (prev.repeat === "never") next.repeatDone = false;
    }
  }
  const changes = describeExpenseChanges(ds, prev, next);
  if (!changes.length) return { ops: [], value: id };
  next.updatedAt = ctx.now;
  next.updatedBy = ctx.me;
  next.history = [...prev.history, entry(ctx, "updated", { changes })];
  return { ops: [{ t: "expense", prev, next }], value: id };
}

export function deleteExpense(ds: Dataset, ctx: Ctx, id: ID): Result {
  const prev = ds.expenses[id] ?? fail("Despesa não encontrada.");
  if (prev.deletedAt) return { ops: [], value: undefined };
  const next: Expense = { ...prev, deletedAt: ctx.now, deletedBy: ctx.me, history: [...prev.history, entry(ctx, "deleted")] };
  return { ops: [{ t: "expense", prev, next }], value: undefined };
}

export function restoreExpense(ds: Dataset, ctx: Ctx, id: ID): Result {
  const prev = ds.expenses[id] ?? fail("Despesa não encontrada.");
  if (!prev.deletedAt) return { ops: [], value: undefined };
  if (prev.groupId && ds.groups[prev.groupId]?.deletedAt) fail("O grupo desta despesa foi excluído. Restaure o grupo primeiro.");
  const next: Expense = { ...prev, history: [...prev.history, entry(ctx, "restored")] };
  delete next.deletedAt;
  delete next.deletedBy;
  return { ops: [{ t: "expense", prev, next }], value: undefined };
}

export function addComment(ds: Dataset, ctx: Ctx, expenseId: ID, text: string): Result {
  const prev = ds.expenses[expenseId] ?? fail("Despesa não encontrada.");
  const t = text.trim();
  if (!t) fail("Escreva um comentário.");
  const c: Comment = { id: ctx.id("c_"), by: ctx.me, text: t, ts: ctx.now };
  return { ops: [{ t: "expense", prev, next: { ...prev, comments: [...prev.comments, c] } }], value: undefined };
}

export function deleteComment(ds: Dataset, ctx: Ctx, expenseId: ID, commentId: ID): Result {
  const prev = ds.expenses[expenseId] ?? fail("Despesa não encontrada.");
  const c = prev.comments.find((x) => x.id === commentId) ?? fail("Comentário não encontrado.");
  if (c.by !== ctx.me) fail("Você só pode apagar os seus comentários.");
  const comments = prev.comments.map((x) => (x.id === commentId ? { ...x, deletedAt: ctx.now } : x));
  return { ops: [{ t: "expense", prev, next: { ...prev, comments } }], value: undefined };
}

export interface PaymentInput {
  from: ID;
  to: ID;
  amount: Cents;
  currency: string;
  date: string;
  groupId: ID | null;
  notes?: string;
}

function paymentExpenseInput(p: PaymentInput): ExpenseInput {
  return {
    groupId: p.groupId,
    description: "Pagamento",
    cost: p.amount,
    currency: p.currency,
    date: p.date,
    category: PAYMENT_CATEGORY,
    paidBy: { [p.from]: p.amount },
    owedBy: { [p.to]: p.amount },
    splitMode: "exact",
    notes: p.notes,
    repeat: "never",
  };
}

/** Registra um ou mais acertos de contas (por exemplo, um por grupo). */
export function recordPayments(ds: Dataset, ctx: Ctx, list: PaymentInput[]): Result<ID[]> {
  const ops: Op[] = [];
  const ids: ID[] = [];
  for (const p of list) {
    if (p.from === p.to) fail("Quem paga e quem recebe precisam ser pessoas diferentes.");
    const input = cleanInput(paymentExpenseInput(p));
    validateExpense(ds, input, true);
    const id = ctx.id("e_");
    const e: Expense = { id, payment: true, ...input, createdAt: ctx.now, createdBy: ctx.me, history: [entry(ctx, "created")], comments: [] };
    if (!e.notes) delete e.notes;
    ops.push({ t: "expense", next: e });
    ids.push(id);
  }
  return { ops, value: ids };
}

/** Edita um pagamento existente. */
export function updatePayment(ds: Dataset, ctx: Ctx, id: ID, p: PaymentInput): Result<ID> {
  if (p.from === p.to) fail("Quem paga e quem recebe precisam ser pessoas diferentes.");
  return saveExpense(ds, ctx, paymentExpenseInput(p), id);
}

/* ---------------- preferências e rotinas ---------------- */

export function setPrefs(ds: Dataset, _ctx: Ctx, patch: Partial<Prefs>): Result {
  return { ops: [{ t: "prefs", next: { ...ds.prefs, ...patch } }], value: undefined };
}

/** Gera as despesas recorrentes que venceram. */
export function spawnRecurring(ds: Dataset, ctx: Ctx): Result<number> {
  const { created, updated } = dueRecurring(ds, ctx.today, ctx.now);
  const ops: Op[] = [
    ...updated.map((next): Op => ({ t: "expense", prev: ds.expenses[next.id], next })),
    ...created.map((next): Op => ({ t: "expense", next })),
  ];
  return { ops, value: created.length };
}
