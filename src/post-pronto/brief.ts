import type { Brief, Destination, EmojiLevel, Goal, Language, Tone } from "./types";

export const DESTINATION_LABELS: Record<Destination, string> = {
  stories: "Stories",
  feed: "Feed",
};

export const GOAL_LABELS: Record<Goal, string> = {
  comments: "Mais interação",
  shares: "Mais alcance",
  sales: "Divulgar ou vender",
  memory: "Registrar um momento",
};

export const TONE_LABELS: Record<Tone, string> = {
  auto: "Deixar o Claude escolher",
  fun: "Leve e divertido",
  inspiring: "Inspirador",
  emotional: "Emotivo",
  elegant: "Elegante",
  professional: "Profissional",
  bold: "Irreverente",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  "pt-en": "Português + inglês",
};

export const EMOJI_LABELS: Record<EmojiLevel, string> = {
  none: "Nenhum",
  few: "Poucos",
  many: "À vontade",
};

export const DEFAULT_BRIEF: Brief = {
  destination: "stories",
  context: "",
  profile: "",
  goal: "comments",
  tone: "auto",
  language: "pt",
  emojis: "few",
};

const PREFS_KEY = "post-pronto:prefs";

/** Preferências que valem para os próximos posts (o contexto de cada post não é guardado). */
export interface Prefs {
  destination: Destination;
  profile: string;
  handle: string;
  goal: Goal;
  tone: Tone;
  language: Language;
  emojis: EmojiLevel;
}

/** O valor salvo, se for uma das opções; senão, o padrão. */
function option<K extends string>(value: unknown, labels: Record<K, string>, fallback: K): K {
  return typeof value === "string" && Object.hasOwn(labels, value) ? (value as K) : fallback;
}

export function loadPrefs(): Prefs {
  const d = DEFAULT_BRIEF;
  const base: Prefs = {
    destination: d.destination,
    profile: d.profile,
    handle: "",
    goal: d.goal,
    tone: d.tone,
    language: d.language,
    emojis: d.emojis,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!saved || typeof saved !== "object") return base;
    return {
      destination: option(saved.destination, DESTINATION_LABELS, base.destination),
      profile: typeof saved.profile === "string" ? saved.profile : base.profile,
      handle: typeof saved.handle === "string" ? saved.handle : base.handle,
      goal: option(saved.goal, GOAL_LABELS, base.goal),
      tone: option(saved.tone, TONE_LABELS, base.tone),
      language: option(saved.language, LANGUAGE_LABELS, base.language),
      emojis: option(saved.emojis, EMOJI_LABELS, base.emojis),
    };
  } catch {
    return base;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // navegação privada ou armazenamento bloqueado: segue sem guardar
  }
}

/** "@ Maria.Silva " → "maria.silva" (só o que o Instagram aceita em nomes de usuário). */
export function cleanHandle(s: string): string {
  return s
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}
