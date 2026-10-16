import { addDays, addMonths } from "./dates";
import type { Dataset, Expense, ID, Repeat } from "./types";

export const REPEAT_LABELS: Record<Repeat, string> = {
  never: "Nunca",
  weekly: "Toda semana",
  biweekly: "A cada 2 semanas",
  monthly: "Todo mês",
  yearly: "Todo ano",
};

/** Data da n-ésima repetição a partir do início da série. */
export function occurrenceDate(start: string, repeat: Repeat, n: number): string {
  switch (repeat) {
    case "weekly":
      return addDays(start, 7 * n);
    case "biweekly":
      return addDays(start, 14 * n);
    case "monthly":
      return addMonths(start, n);
    case "yearly":
      return addMonths(start, 12 * n);
    default:
      return start;
  }
}

export function nextOccurrence(e: Expense): string | null {
  if (e.repeat === "never") return null;
  return occurrenceDate(e.seriesStart ?? e.date, e.repeat, (e.seriesIndex ?? 0) + 1);
}

/**
 * Gera as ocorrências de despesas recorrentes que já venceram (até hoje), como o Splitwise faz.
 * Devolve as despesas novas e as que foram marcadas como "já repetida".
 * O id da ocorrência é determinístico, para não duplicar se dois aparelhos gerarem ao mesmo tempo.
 */
export function dueRecurring(ds: Dataset, today: string, nowTs: string): { created: Expense[]; updated: Expense[] } {
  const created: Expense[] = [];
  const updated: Expense[] = [];
  for (const e of Object.values(ds.expenses)) {
    if (e.deletedAt || e.payment || e.repeat === "never" || e.repeatDone) continue;
    if (e.groupId && (!ds.groups[e.groupId] || ds.groups[e.groupId].deletedAt)) continue;
    let cur = e;
    let first = true;
    for (let guard = 0; guard < 500; guard++) {
      const next = nextOccurrence(cur);
      if (!next || next > today) break;
      const seriesId: ID = cur.seriesId ?? cur.id;
      const id = `r_${seriesId}_${next}`;
      if (ds.expenses[id]) {
        // já existe (gerada por outro aparelho): só marca a atual
        if (first) updated.push({ ...cur, repeatDone: true });
        else created[created.length - 1] = { ...cur, repeatDone: true };
        break;
      }
      const child: Expense = {
        ...cur,
        id,
        date: next,
        seriesId,
        seriesStart: cur.seriesStart ?? cur.date,
        seriesIndex: (cur.seriesIndex ?? 0) + 1,
        repeatDone: false,
        createdAt: nowTs,
        createdBy: cur.createdBy,
        updatedAt: undefined,
        updatedBy: undefined,
        deletedAt: undefined,
        deletedBy: undefined,
        history: [{ ts: nowTs, by: cur.createdBy, type: "created", auto: true }],
        comments: [],
      };
      if (first) updated.push({ ...cur, repeatDone: true });
      else created[created.length - 1] = { ...cur, repeatDone: true };
      created.push(child);
      cur = child;
      first = false;
    }
  }
  return { created, updated };
}
