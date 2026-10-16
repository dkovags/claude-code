const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Data local de hoje no formato AAAA-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseISODate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISODate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parseISODate(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** "16/10/2026" */
export function formatDate(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "16 de outubro de 2026" */
export function formatDateLong(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "16 de out." (com o ano quando não for o ano atual) */
export function formatDateShort(iso: string, today: string = todayISO()): string {
  const { y, m, d } = parseISODate(iso);
  const base = `${d} de ${MONTHS_SHORT[m - 1]}.`;
  return y === parseISODate(today).y ? base : `${base} de ${y}`;
}

/** Mês e dia para o "calendarinho" das listas: { mon: "OUT", day: "16" } */
export function dayTile(iso: string): { mon: string; day: string } {
  const { m, d } = parseISODate(iso);
  return { mon: MONTHS_SHORT[m - 1].toUpperCase(), day: String(d) };
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** "outubro de 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** Data e hora de um registro, de forma relativa: "agora", "há 5 min", "hoje às 14:32", "ontem às 09:10", "16 de out.". */
export function relativeTime(ts: string, now: Date = new Date()): string {
  const t = new Date(ts);
  const diff = (now.getTime() - t.getTime()) / 1000;
  if (diff < 60 && diff > -60) return "agora";
  if (diff > 0 && diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  const hm = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const day = todayISO(t);
  const today = todayISO(now);
  if (day === today) return `hoje às ${hm}`;
  if (day === addDays(today, -1)) return `ontem às ${hm}`;
  return formatDateShort(day, today);
}

export function formatDateTime(ts: string): string {
  const t = new Date(ts);
  return `${formatDate(todayISO(t))} às ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}
