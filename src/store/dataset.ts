import { colorFor, isValidEmail, normalizeEmail } from "../domain/people";
import type { Dataset, Expense, Group, Person } from "../domain/types";
import { UserError, type Ctx } from "./actions";
import { emailId } from "./rename";

/** Cria os dados iniciais com o próprio usuário. */
export function createDataset(ctx: Omit<Ctx, "me">, input: { name: string; email?: string; currency: string }): Dataset {
  const name = input.name.trim();
  if (!name) throw new UserError("Informe o seu nome.");
  const email = normalizeEmail(input.email);
  if (email && !isValidEmail(email)) throw new UserError("E-mail inválido.");
  const meId = email ? emailId(email) : ctx.id("p_");
  const me: Person = { id: meId, name, color: colorFor(meId), createdAt: ctx.now };
  if (email) me.email = email;
  return {
    version: 1,
    meId,
    people: { [meId]: me },
    groups: {},
    expenses: {},
    prefs: { currency: input.currency || "BRL", theme: "auto" },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Confere a estrutura de dados lidos do armazenamento ou de um backup e completa campos que faltarem. */
export function normalizeDataset(raw: unknown): Dataset {
  if (!isObj(raw)) throw new UserError("Arquivo inválido.");
  const d = isObj(raw.data) && raw.app === "rateio" ? raw.data : raw;
  if (d.version !== 1 || typeof d.meId !== "string" || !isObj(d.people) || !isObj(d.groups) || !isObj(d.expenses))
    throw new UserError("Este arquivo não é um backup válido do Rateio.");
  const people = d.people as Record<string, Person>;
  if (!people[d.meId]) throw new UserError("Backup sem o usuário principal.");
  const groups: Record<string, Group> = {};
  for (const [id, g] of Object.entries(d.groups as Record<string, Partial<Group>>))
    groups[id] = {
      simplifyDebts: false, currency: "BRL", type: "other", history: [], ...g, memberIds: [...(g.memberIds || [])],
    } as Group;
  const expenses: Record<string, Expense> = {};
  for (const [id, e] of Object.entries(d.expenses as Record<string, Partial<Expense>>))
    expenses[id] = {
      repeat: "never", history: [], comments: [], splitMode: "exact", payment: false, groupId: null, ...e,
    } as Expense;
  const prefs = isObj(d.prefs) ? (d.prefs as unknown as Dataset["prefs"]) : { currency: "BRL", theme: "auto" as const };
  return {
    version: 1,
    meId: d.meId,
    people,
    groups,
    expenses,
    prefs: { currency: prefs.currency || "BRL", theme: prefs.theme || "auto" },
  };
}

/** Arquivo de backup (JSON) com metadados. */
export function toBackup(ds: Dataset): string {
  return JSON.stringify({ app: "rateio", exportedAt: new Date().toISOString(), data: ds }, null, 2);
}
