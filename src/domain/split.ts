import type { Cents, ID, SplitMode } from "./types";

export type SplitResult =
  | { ok: true; shares: Record<ID, Cents> }
  | { ok: false; error: string; shares?: Record<ID, Cents> };

/** Divide igualmente; os centavos que sobram vão para os primeiros da lista. */
export function splitEqual(cost: Cents, ids: ID[]): Record<ID, Cents> {
  const out: Record<ID, Cents> = {};
  if (!ids.length) return out;
  const n = ids.length;
  const base = Math.floor(cost / n);
  let rest = cost - base * n;
  for (const id of ids) {
    out[id] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return out;
}

/** Converte pesos decimais em inteiros exatos (até 6 casas). */
function toIntWeights(weights: number[]): bigint[] {
  const decimals = Math.min(
    6,
    Math.max(0, ...weights.map((w) => {
      const s = String(w);
      if (s.includes("e")) return 6;
      const i = s.indexOf(".");
      return i < 0 ? 0 : s.length - i - 1;
    })),
  );
  const f = 10 ** decimals;
  return weights.map((w) => BigInt(Math.round(w * f)));
}

/**
 * Distribui um valor proporcionalmente aos pesos pelo método do maior resto,
 * com aritmética exata. Empates vão para quem aparece primeiro.
 */
export function distribute(cost: Cents, ids: ID[], weights: number[]): Record<ID, Cents> {
  const ws = toIntWeights(weights);
  const total = ws.reduce((a, b) => a + b, 0n);
  const out: Record<ID, Cents> = {};
  if (total <= 0n) return out;
  const c = BigInt(cost);
  const parts = ws.map((w, i) => ({ i, q: (c * w) / total, r: (c * w) % total }));
  let assigned = parts.reduce((a, p) => a + p.q, 0n);
  const order = [...parts].sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const p of order) {
    if (assigned >= c) break;
    p.q += 1n;
    assigned += 1n;
  }
  ids.forEach((id, i) => (out[id] = Number(parts[i].q)));
  return out;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Calcula a parte de cada participante conforme o modo de divisão do Splitwise:
 * - equal: igualmente entre os participantes;
 * - exact: valores exatos (em centavos), que devem somar o total;
 * - percent: porcentagens que devem somar 100;
 * - shares: partes (pesos), por exemplo 2 para um casal e 1 para uma pessoa;
 * - adjust: ajuste em centavos somado à divisão igual do restante.
 */
export function computeSplit(
  mode: SplitMode,
  cost: Cents,
  ids: ID[],
  values: Record<ID, number> = {},
): SplitResult {
  if (!Number.isInteger(cost) || cost <= 0) return { ok: false, error: "Informe um valor maior que zero." };
  if (!ids.length) return { ok: false, error: "Escolha ao menos uma pessoa para dividir." };
  const v = (id: ID) => values[id] ?? 0;
  switch (mode) {
    case "equal":
      return { ok: true, shares: splitEqual(cost, ids) };
    case "exact": {
      const shares: Record<ID, Cents> = {};
      for (const id of ids) {
        const x = Math.round(v(id));
        if (x < 0) return { ok: false, error: "Os valores não podem ser negativos." };
        shares[id] = x;
      }
      const total = sum(Object.values(shares));
      if (total !== cost) return { ok: false, error: "A soma dos valores precisa ser igual ao total.", shares };
      return { ok: true, shares };
    }
    case "percent": {
      const ps = ids.map(v);
      if (ps.some((p) => p < 0)) return { ok: false, error: "As porcentagens não podem ser negativas." };
      if (Math.abs(sum(ps) - 100) > 1e-6) return { ok: false, error: "As porcentagens precisam somar 100%." };
      return { ok: true, shares: distribute(cost, ids, ps) };
    }
    case "shares": {
      const ws = ids.map(v);
      if (ws.some((w) => w < 0)) return { ok: false, error: "As partes não podem ser negativas." };
      if (sum(ws) <= 0) return { ok: false, error: "Informe ao menos uma parte." };
      return { ok: true, shares: distribute(cost, ids, ws) };
    }
    case "adjust": {
      const adj = ids.map((id) => Math.round(v(id)));
      const rest = cost - sum(adj);
      if (rest < 0) return { ok: false, error: "Os ajustes passam do valor total." };
      const eq = splitEqual(rest, ids);
      const shares: Record<ID, Cents> = {};
      ids.forEach((id, i) => (shares[id] = adj[i] + eq[id]));
      if (Object.values(shares).some((x) => x < 0)) return { ok: false, error: "Nenhuma parte pode ficar negativa." };
      return { ok: true, shares };
    }
  }
}

/** Remove participantes com valor zero. */
export function nonZero(map: Record<ID, Cents>): Record<ID, Cents> {
  const out: Record<ID, Cents> = {};
  for (const [k, x] of Object.entries(map)) if (x) out[k] = x;
  return out;
}
