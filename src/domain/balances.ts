import { addTo, clean, negativePart, positivePart, sumBalances } from "./money";
import type { Balance, Cents, Dataset, Debt, Expense, ID } from "./types";

/** Saldo de cada pessoa numa despesa: quanto pagou menos quanto deve. */
export function expenseNets(e: Expense): Record<ID, Cents> {
  const nets: Record<ID, Cents> = {};
  for (const [id, v] of Object.entries(e.paidBy)) nets[id] = (nets[id] || 0) + v;
  for (const [id, v] of Object.entries(e.owedBy)) nets[id] = (nets[id] || 0) - v;
  return nets;
}

/**
 * Transforma saldos líquidos em pagamentos: quem deve mais paga para quem tem mais a receber,
 * repetindo até zerar (algoritmo usado na simplificação de dívidas). Gera no máximo n-1 pagamentos.
 */
export function settleNets(nets: Record<ID, Cents>, currency: string): Debt[] {
  const cred = Object.entries(nets).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debt = Object.entries(nets).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: Debt[] = [];
  const pick = (list: { id: ID; v: Cents }[]) =>
    list.reduce<{ id: ID; v: Cents } | null>(
      (best, x) => (x.v > 0 && (!best || x.v > best.v || (x.v === best.v && x.id < best.id)) ? x : best),
      null,
    );
  for (;;) {
    const c = pick(cred);
    const d = pick(debt);
    if (!c || !d) break;
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount, currency });
    c.v -= amount;
    d.v -= amount;
  }
  return out;
}

/** Quem deve a quem dentro de uma única despesa. */
export function expenseDebts(e: Expense): Debt[] {
  return settleNets(expenseNets(e), e.currency);
}

/** Saldo líquido de cada pessoa, por moeda: { BRL: { ana: 500, bia: -500 } }. */
export function netsByCurrency(expenses: Expense[]): Record<string, Record<ID, Cents>> {
  const out: Record<string, Record<ID, Cents>> = {};
  for (const e of expenses) {
    const m = (out[e.currency] ||= {});
    for (const [id, v] of Object.entries(expenseNets(e))) m[id] = (m[id] || 0) + v;
  }
  return out;
}

/** Dívidas sem simplificação: soma o que cada par deve entre si e compensa nos dois sentidos. */
export function pairwiseDebts(expenses: Expense[]): Debt[] {
  const pair = new Map<string, Debt>();
  for (const e of expenses) {
    for (const d of expenseDebts(e)) {
      const [a, b] = d.from < d.to ? [d.from, d.to] : [d.to, d.from];
      const key = `${e.currency}\u0000${a}\u0000${b}`;
      const cur = pair.get(key) || { from: a, to: b, amount: 0, currency: e.currency };
      // amount positivo: a deve a b
      cur.amount += d.from === a ? d.amount : -d.amount;
      pair.set(key, cur);
    }
  }
  const out: Debt[] = [];
  for (const d of pair.values()) {
    if (d.amount > 0) out.push(d);
    else if (d.amount < 0) out.push({ from: d.to, to: d.from, amount: -d.amount, currency: d.currency });
  }
  return out.sort(debtOrder);
}

/** Dívidas simplificadas: cada pessoa continua com o mesmo saldo, mas com o menor número de pagamentos. */
export function simplifiedDebts(expenses: Expense[]): Debt[] {
  const out: Debt[] = [];
  for (const [cur, nets] of Object.entries(netsByCurrency(expenses))) out.push(...settleNets(nets, cur));
  return out.sort(debtOrder);
}

function debtOrder(a: Debt, b: Debt): number {
  return a.currency.localeCompare(b.currency) || b.amount - a.amount || a.from.localeCompare(b.from) || a.to.localeCompare(b.to);
}

/** Despesas que contam para os saldos: não excluídas e de grupos não excluídos. */
export function activeExpenses(ds: Dataset): Expense[] {
  return Object.values(ds.expenses).filter(
    (e) => !e.deletedAt && (!e.groupId || (ds.groups[e.groupId] && !ds.groups[e.groupId].deletedAt)),
  );
}

export interface Ledger {
  /** Despesas ativas, da mais recente para a mais antiga. */
  active: Expense[];
  /** Dívidas de cada grupo (chave "" para despesas sem grupo). */
  debtsByGroup: Map<string, Debt[]>;
  /** Saldo líquido de cada membro em cada grupo, por moeda. */
  netsByGroup: Map<string, Record<string, Record<ID, Cents>>>;
  /** Saldo de cada pessoa comigo (positivo: ela me deve). */
  friendBalance: Map<ID, Balance>;
  /** Saldo de cada pessoa comigo, separado por grupo ("" = sem grupo). */
  friendByGroup: Map<ID, Map<string, Balance>>;
  /** Meu saldo em cada grupo (positivo: tenho a receber). */
  myGroupBalance: Map<string, Balance>;
  total: Balance;
  owe: Balance;
  owed: Balance;
}

export function groupKey(groupId: ID | null): string {
  return groupId ?? "";
}

/** Calcula todos os saldos do ponto de vista de "me". */
export function buildLedger(ds: Dataset, me: ID = ds.meId): Ledger {
  const active = activeExpenses(ds).sort(expenseOrder);
  const byGroup = new Map<string, Expense[]>();
  for (const e of active) {
    const k = groupKey(e.groupId);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(e);
  }
  const debtsByGroup = new Map<string, Debt[]>();
  const netsByGroup = new Map<string, Record<string, Record<ID, Cents>>>();
  for (const [k, list] of byGroup) {
    const g = k ? ds.groups[k] : null;
    debtsByGroup.set(k, g && g.simplifyDebts ? simplifiedDebts(list) : pairwiseDebts(list));
    netsByGroup.set(k, netsByCurrency(list));
  }
  const friendBalance = new Map<ID, Balance>();
  const friendByGroup = new Map<ID, Map<string, Balance>>();
  const myGroupBalance = new Map<string, Balance>();
  for (const [k, debts] of debtsByGroup) {
    for (const d of debts) {
      let other: ID;
      let amount: Cents;
      if (d.to === me) [other, amount] = [d.from, d.amount];
      else if (d.from === me) [other, amount] = [d.to, -d.amount];
      else continue;
      addTo(getOr(friendBalance, other, () => ({})), d.currency, amount);
      addTo(getOr(getOr(friendByGroup, other, () => new Map()), k, () => ({})), d.currency, amount);
      addTo(getOr(myGroupBalance, k, () => ({})), d.currency, amount);
    }
  }
  for (const [id, b] of friendBalance) friendBalance.set(id, clean(b));
  for (const [k, b] of myGroupBalance) myGroupBalance.set(k, clean(b));
  for (const m of friendByGroup.values()) for (const [k, b] of m) m.set(k, clean(b));
  const all = [...friendBalance.values()];
  return {
    active,
    debtsByGroup,
    netsByGroup,
    friendBalance,
    friendByGroup,
    myGroupBalance,
    total: sumBalances(...all),
    owe: sumBalances(...all.map(negativePart)),
    owed: sumBalances(...all.map(positivePart)),
  };
}

function getOr<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

/** Ordem das listas: data mais recente primeiro; no mesmo dia, a criada por último primeiro. */
export function expenseOrder(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

/** Saldo de uma pessoa num grupo (positivo: tem a receber). */
export function memberBalance(ledger: Ledger, groupId: ID | null, personId: ID): Balance {
  const nets = ledger.netsByGroup.get(groupKey(groupId)) || {};
  const out: Balance = {};
  for (const [cur, m] of Object.entries(nets)) if (m[personId]) out[cur] = m[personId];
  return out;
}

/** Valores de uma despesa do ponto de vista de uma pessoa. */
export function expenseFor(e: Expense, me: ID): { paid: Cents; owed: Cents; net: Cents; involved: boolean } {
  const paid = e.paidBy[me] || 0;
  const owed = e.owedBy[me] || 0;
  return { paid, owed, net: paid - owed, involved: me in e.paidBy || me in e.owedBy };
}

/** Quanto "other" deve a "me" por causa desta despesa (negativo: eu devo a ele). */
export function expensePairAmount(e: Expense, me: ID, other: ID): Cents {
  let v = 0;
  for (const d of expenseDebts(e)) {
    if (d.from === other && d.to === me) v += d.amount;
    else if (d.from === me && d.to === other) v -= d.amount;
  }
  return v;
}

/** Pessoas envolvidas numa despesa, na ordem: quem pagou, depois quem deve. */
export function participants(e: Expense): ID[] {
  const ids: ID[] = [];
  for (const id of [...Object.keys(e.paidBy), ...Object.keys(e.owedBy)]) if (!ids.includes(id)) ids.push(id);
  return ids;
}
