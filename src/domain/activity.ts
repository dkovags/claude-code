import { categoryFullLabel } from "./categories";
import { formatDate } from "./dates";
import { formatMoney } from "./money";
import { personName } from "./people";
import { REPEAT_LABELS } from "./recurring";
import type { Comment, Dataset, Expense, Group, HistoryEntry, ID, Person } from "./types";

const GROUP_TYPE_LABELS: Record<string, string> = { home: "Casa", trip: "Viagem", couple: "Casal", other: "Outro" };

/** Lista legível do que mudou numa despesa (vai para o histórico e para a atividade). */
export function describeExpenseChanges(ds: Dataset, prev: Expense, next: Expense): string[] {
  const out: string[] = [];
  const money = (e: Expense) => formatMoney(e.cost, e.currency);
  if (prev.description !== next.description) out.push(`descrição de “${prev.description}” para “${next.description}”`);
  if (prev.cost !== next.cost || prev.currency !== next.currency) out.push(`valor de ${money(prev)} para ${money(next)}`);
  if (prev.date !== next.date) out.push(`data de ${formatDate(prev.date)} para ${formatDate(next.date)}`);
  if (prev.category !== next.category && !next.payment)
    out.push(`categoria de ${categoryFullLabel(prev.category)} para ${categoryFullLabel(next.category)}`);
  if (prev.groupId !== next.groupId) {
    const gname = (id: ID | null) => (id ? `“${ds.groups[id]?.name ?? "grupo"}”` : "sem grupo");
    out.push(`grupo de ${gname(prev.groupId)} para ${gname(next.groupId)}`);
  }
  // com o mesmo pagador e a mesma divisão, mudar o valor não conta como mudança de pagador/divisão
  const sameCost = prev.cost === next.cost;
  if (!sameKeys(prev.paidBy, next.paidBy) || (sameCost && !sameMap(prev.paidBy, next.paidBy))) {
    if (next.payment) out.push("pagador alterado");
    else out.push(`pago por ${payerText(ds, next)}`);
  }
  if (
    prev.splitMode !== next.splitMode ||
    !sameKeys(prev.owedBy, next.owedBy) ||
    (sameCost && !sameMap(prev.owedBy, next.owedBy)) ||
    (next.splitMode !== "equal" && JSON.stringify(prev.splitValues || {}) !== JSON.stringify(next.splitValues || {}))
  ) {
    if (next.payment) out.push("recebedor alterado");
    else out.push("divisão alterada");
  }
  if ((prev.notes || "") !== (next.notes || "")) out.push(next.notes ? "observações alteradas" : "observações removidas");
  if (prev.repeat !== next.repeat) out.push(`repetição: ${REPEAT_LABELS[next.repeat].toLowerCase()}`);
  return out;
}

export function describeGroupChanges(prev: Group, next: Group): string[] {
  const out: string[] = [];
  if (prev.name !== next.name) out.push(`nome de “${prev.name}” para “${next.name}”`);
  if (prev.type !== next.type) out.push(`tipo: ${GROUP_TYPE_LABELS[next.type]}`);
  if (prev.currency !== next.currency) out.push(`moeda padrão: ${next.currency}`);
  if (prev.simplifyDebts !== next.simplifyDebts)
    out.push(next.simplifyDebts ? "simplificação de dívidas ativada" : "simplificação de dívidas desativada");
  return out;
}

function sameKeys(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a).filter((k) => a[k]).sort();
  const kb = Object.keys(b).filter((k) => b[k]).sort();
  return ka.join("\u0000") === kb.join("\u0000");
}

function sameMap(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

export function payerText(ds: Dataset, e: Expense): string {
  const ids = Object.keys(e.paidBy).filter((k) => e.paidBy[k]);
  if (ids.length === 1) return ids[0] === ds.meId ? "você" : personName(ds, ids[0]);
  return `${ids.length} pessoas`;
}

export type FeedItem =
  | { kind: "expense"; key: string; ts: string; by: ID; entry: HistoryEntry; expense: Expense }
  | { kind: "comment"; key: string; ts: string; by: ID; comment: Comment; expense: Expense }
  | { kind: "group"; key: string; ts: string; by: ID; entry: HistoryEntry; group: Group }
  | { kind: "friend"; key: string; ts: string; by: ID; person: Person };

/** Monta o feed de "Atividade recente" a partir do histórico de despesas, grupos e amigos. */
export function buildFeed(ds: Dataset): FeedItem[] {
  const out: FeedItem[] = [];
  for (const e of Object.values(ds.expenses)) {
    e.history.forEach((h, i) => out.push({ kind: "expense", key: `e:${e.id}:${i}`, ts: h.ts, by: h.by, entry: h, expense: e }));
    for (const c of e.comments)
      if (!c.deletedAt) out.push({ kind: "comment", key: `c:${e.id}:${c.id}`, ts: c.ts, by: c.by, comment: c, expense: e });
  }
  for (const g of Object.values(ds.groups))
    g.history.forEach((h, i) => out.push({ kind: "group", key: `g:${g.id}:${i}`, ts: h.ts, by: h.by, entry: h, group: g }));
  for (const p of Object.values(ds.people))
    if (p.id !== ds.meId && p.createdBy && !p.hidden)
      out.push({ kind: "friend", key: `p:${p.id}`, ts: p.createdAt, by: p.createdBy, person: p });
  return out.sort((a, b) => b.ts.localeCompare(a.ts) || a.key.localeCompare(b.key));
}
