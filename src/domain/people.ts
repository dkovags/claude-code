import type { Dataset, ID, Person } from "./types";

export const AVATAR_COLORS = [
  "#5bc5a7", "#ff652f", "#7b6cd9", "#e0507a", "#3d8fd1", "#f2b134", "#4cae4c", "#a0522d", "#2bb3c0", "#8e8e93",
];

export function personName(ds: Dataset, id: ID): string {
  return ds.people[id]?.name || "Pessoa desconhecida";
}

/** "você" (ou "Você" no começo da frase) para o próprio usuário; o nome para os demais. */
export function who(ds: Dataset, id: ID, capital = false): string {
  if (id === ds.meId) return capital ? "Você" : "você";
  return personName(ds, id);
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normalizeEmail(email: string | undefined): string | undefined {
  const e = email?.trim().toLowerCase();
  return e || undefined;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Amigos visíveis (todas as pessoas menos eu e as amizades removidas), em ordem alfabética. */
export function friendsOf(ds: Dataset): Person[] {
  return Object.values(ds.people)
    .filter((p) => p.id !== ds.meId && !p.hidden)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function findPersonByEmail(ds: Dataset, email: string): Person | undefined {
  const e = normalizeEmail(email);
  return Object.values(ds.people).find((p) => p.email && p.email === e);
}

export function colorFor(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % AVATAR_COLORS.length;
}
