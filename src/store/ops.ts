import type { Dataset, Expense, Group, Person, Prefs } from "../domain/types";

/**
 * Alterações produzidas pelas ações. Cada uma traz a versão nova da entidade e, quando é edição,
 * a anterior. O armazenamento local simplesmente substitui; o da nuvem calcula o que mudou.
 */
export type Op =
  | { t: "person"; next: Person; prev?: Person }
  | { t: "group"; next: Group; prev?: Group }
  | { t: "expense"; next: Expense; prev?: Expense }
  | { t: "prefs"; next: Prefs };

export function applyOps(ds: Dataset, ops: Op[]): Dataset {
  if (!ops.length) return ds;
  const out: Dataset = { ...ds, people: { ...ds.people }, groups: { ...ds.groups }, expenses: { ...ds.expenses } };
  for (const op of ops) {
    if (op.t === "person") out.people[op.next.id] = op.next;
    else if (op.t === "group") out.groups[op.next.id] = op.next;
    else if (op.t === "expense") out.expenses[op.next.id] = op.next;
    else out.prefs = op.next;
  }
  return out;
}
