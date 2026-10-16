import type { Balance, Cents } from "./types";

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "BRL", name: "Real brasileiro" },
  { code: "USD", name: "Dólar americano" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "ARS", name: "Peso argentino" },
  { code: "CLP", name: "Peso chileno" },
  { code: "UYU", name: "Peso uruguaio" },
  { code: "PYG", name: "Guarani paraguaio" },
  { code: "COP", name: "Peso colombiano" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "CAD", name: "Dólar canadense" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "CHF", name: "Franco suíço" },
  { code: "JPY", name: "Iene japonês" },
  { code: "CNY", name: "Yuan chinês" },
];

const decimalsCache = new Map<string, number>();
const formatCache = new Map<string, Intl.NumberFormat>();

/** Casas decimais da moeda (2 para BRL, 0 para JPY etc.). */
export function decimalsFor(currency: string): number {
  let d = decimalsCache.get(currency);
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    decimalsCache.set(currency, d);
  }
  return d;
}

export function minorFactor(currency: string): number {
  return 10 ** decimalsFor(currency);
}

function formatter(currency: string): Intl.NumberFormat {
  let f = formatCache.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    } catch {
      f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatCache.set(currency, f);
  }
  return f;
}

/** Formata centavos como moeda: 123456 → "R$ 1.234,56". */
export function formatMoney(cents: Cents, currency: string, opts: { abs?: boolean } = {}): string {
  let v = cents;
  if (opts.abs) v = Math.abs(v);
  if (v === 0) v = 0; // evita "-R$ 0,00"
  return formatter(currency).format(v / minorFactor(currency));
}

/** Valor para um campo de edição: 1250 → "12,50" (sem separador de milhar). */
export function formatInput(cents: Cents, currency: string): string {
  const d = decimalsFor(currency);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const f = 10 ** d;
  const int = Math.floor(abs / f);
  const frac = abs % f;
  const s = d > 0 ? `${int},${String(frac).padStart(d, "0")}` : String(int);
  return neg ? `-${s}` : s;
}

/**
 * Interpreta um número digitado em formato brasileiro ou americano:
 * "1.234,56", "1234,56", "1234.56", "12.500" (doze mil e quinhentos), "1,5".
 */
export function parseNumber(token: string): number | null {
  const s = token.trim();
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let normalized: string;
  if (dots && commas) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      if (commas > 1) return null;
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      if (dots > 1) return null;
      normalized = s.replace(/,/g, "");
    }
  } else if (commas) {
    normalized = commas === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (dots) {
    if (dots > 1) normalized = s.replace(/\./g, "");
    else {
      const [intPart, fracPart] = s.split(".");
      // "12.500" no padrão brasileiro é doze mil e quinhentos
      normalized = fracPart.length === 3 && intPart.length > 0 && intPart !== "0" ? intPart + fracPart : s;
    }
  } else normalized = s;
  if (normalized.startsWith(".")) normalized = "0" + normalized;
  if (normalized.endsWith(".")) normalized = normalized.slice(0, -1);
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Avalia um valor digitado, aceitando contas simples como na calculadora do Splitwise:
 * "12,50", "10+5,5", "100/3", "2*(15+3)". Devolve null se a expressão for inválida.
 */
export function evaluateAmount(input: string): number | null {
  const src = input.replace(/[\sR$€£¥]/g, "").replace(/[A-Za-z]/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!src) return null;
  let pos = 0;
  const peek = () => src[pos];
  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }
  function parseFactor(): number | null {
    if (peek() === "-") {
      pos++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (peek() === "+") {
      pos++;
      return parseFactor();
    }
    if (peek() === "(") {
      pos++;
      const v = parseExpr();
      if (v === null || peek() !== ")") return null;
      pos++;
      return v;
    }
    const m = /^[0-9.,]+/.exec(src.slice(pos));
    if (!m) return null;
    pos += m[0].length;
    return parseNumber(m[0]);
  }
  const v = parseExpr();
  if (v === null || pos !== src.length || !Number.isFinite(v)) return null;
  return v;
}

/** Converte o texto digitado em centavos (arredondando para a menor unidade da moeda). */
export function parseAmount(input: string, currency: string): Cents | null {
  const v = evaluateAmount(input);
  if (v === null) return null;
  const f = minorFactor(currency);
  return Math.round(v * f + (v >= 0 ? 1e-9 : -1e-9));
}

/* ---------- saldos por moeda ---------- */

export function addTo(b: Balance, currency: string, amount: Cents): Balance {
  b[currency] = (b[currency] || 0) + amount;
  return b;
}

export function sumBalances(...list: Balance[]): Balance {
  const out: Balance = {};
  for (const b of list) for (const [c, v] of Object.entries(b)) addTo(out, c, v);
  return clean(out);
}

export function negate(b: Balance): Balance {
  const out: Balance = {};
  for (const [c, v] of Object.entries(b)) if (v) out[c] = -v;
  return out;
}

/** Remove moedas com saldo zero. */
export function clean(b: Balance): Balance {
  const out: Balance = {};
  for (const [c, v] of Object.entries(b)) if (v) out[c] = v;
  return out;
}

export function isZero(b: Balance): boolean {
  return Object.values(b).every((v) => !v);
}

export function positivePart(b: Balance): Balance {
  const out: Balance = {};
  for (const [c, v] of Object.entries(b)) if (v > 0) out[c] = v;
  return out;
}

export function negativePart(b: Balance): Balance {
  const out: Balance = {};
  for (const [c, v] of Object.entries(b)) if (v < 0) out[c] = v;
  return out;
}

/** Ordena moedas: a preferida primeiro, depois alfabética. */
export function currenciesOf(b: Balance, preferred?: string): string[] {
  return Object.keys(b)
    .filter((c) => b[c])
    .sort((a, c) => (a === preferred ? -1 : c === preferred ? 1 : a.localeCompare(c)));
}

/** "R$ 10,00 + US$ 5,00". Com abs, ignora o sinal. */
export function formatBalance(b: Balance, opts: { abs?: boolean; preferred?: string } = {}): string {
  const cs = currenciesOf(b, opts.preferred);
  if (!cs.length) return formatMoney(0, opts.preferred || "BRL");
  return cs.map((c) => formatMoney(b[c], c, { abs: opts.abs })).join(" + ");
}
