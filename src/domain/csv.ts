import { expenseNets } from "./balances";
import { categoryFullLabel } from "./categories";
import { formatDate } from "./dates";
import { decimalsFor, minorFactor } from "./money";
import { personName } from "./people";
import type { Dataset, Expense, ID } from "./types";

function num(cents: number, currency: string): string {
  return (cents / minorFactor(currency)).toFixed(decimalsFor(currency)).replace(".", ",");
}

function cell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Planilha no mesmo formato da exportação do Splitwise: uma linha por despesa e uma coluna por pessoa
 * com o efeito da despesa no saldo dela (positivo: tem a receber). Separador ";" e vírgula decimal,
 * que o Excel em português abre direto.
 */
export function expensesToCsv(ds: Dataset, expenses: Expense[], peopleIds?: ID[]): string {
  const list = [...expenses].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const ids: ID[] = peopleIds ? [...peopleIds] : [];
  if (!peopleIds)
    for (const e of list) for (const id of Object.keys(expenseNets(e))) if (!ids.includes(id)) ids.push(id);
  const header = ["Data", "Descrição", "Categoria", "Custo", "Moeda", ...ids.map((id) => personName(ds, id))];
  const rows: string[][] = [header];
  const totals: Record<string, Record<ID, number>> = {};
  for (const e of list) {
    const nets = expenseNets(e);
    const t = (totals[e.currency] ||= {});
    const desc = e.payment
      ? `${personName(ds, Object.keys(e.paidBy)[0])} pagou ${personName(ds, Object.keys(e.owedBy)[0])}`
      : e.description;
    rows.push([
      formatDate(e.date),
      desc,
      e.payment ? "Pagamento" : categoryFullLabel(e.category),
      num(e.cost, e.currency),
      e.currency,
      ...ids.map((id) => {
        t[id] = (t[id] || 0) + (nets[id] || 0);
        return num(nets[id] || 0, e.currency);
      }),
    ]);
  }
  for (const [cur, t] of Object.entries(totals)) {
    rows.push([]);
    rows.push(["", "Saldo total", "", "", cur, ...ids.map((id) => num(t[id] || 0, cur))]);
  }
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
