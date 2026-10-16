import type { Dataset, Expense, Group, HistoryEntry, ID } from "../domain/types";
import type { Op } from "./ops";

/** Identificador de quem tem e-mail: o próprio e-mail, para a mesma pessoa ser reconhecida em qualquer aparelho. */
export function emailId(email: string): ID {
  return `m:${email.trim().toLowerCase()}`;
}

/**
 * Troca o identificador de uma pessoa em todos os grupos e despesas (por exemplo, quando ela ganha um e-mail).
 * Devolve as alterações; a pessoa em si deve ser recriada com o novo id por quem chamar.
 */
export function renamePersonOps(ds: Dataset, oldId: ID, newId: ID): Op[] {
  const ops: Op[] = [];
  const r = (id: ID) => (id === oldId ? newId : id);
  const rmap = <V>(m: Record<ID, V>): Record<ID, V> => Object.fromEntries(Object.entries(m).map(([k, v]) => [r(k), v]));
  const rhist = (h: HistoryEntry): HistoryEntry => ({ ...h, by: r(h.by), ...(h.personId ? { personId: r(h.personId) } : {}) });
  const mentions = (x: unknown) => JSON.stringify(x).includes(JSON.stringify(oldId));

  for (const g of Object.values(ds.groups)) {
    if (!mentions(g)) continue;
    const next: Group = { ...g, memberIds: g.memberIds.map(r), createdBy: r(g.createdBy), history: g.history.map(rhist) };
    if (g.deletedBy) next.deletedBy = r(g.deletedBy);
    ops.push({ t: "group", prev: g, next });
  }
  for (const e of Object.values(ds.expenses)) {
    if (!mentions(e)) continue;
    const next: Expense = {
      ...e,
      paidBy: rmap(e.paidBy),
      owedBy: rmap(e.owedBy),
      createdBy: r(e.createdBy),
      history: e.history.map(rhist),
      comments: e.comments.map((c) => ({ ...c, by: r(c.by) })),
    };
    if (e.splitValues) next.splitValues = rmap(e.splitValues);
    if (e.updatedBy) next.updatedBy = r(e.updatedBy);
    if (e.deletedBy) next.deletedBy = r(e.deletedBy);
    ops.push({ t: "expense", prev: e, next });
  }
  for (const p of Object.values(ds.people))
    if (p.id !== oldId && p.createdBy === oldId) ops.push({ t: "person", prev: p, next: { ...p, createdBy: newId } });
  return ops;
}
