// Regras do Instagram para a legenda e o texto que vai para a área de transferência e para o arquivo.
import type { Draft, MusicPick, PlacePick, Sticker, StickerKind, StoryFrame, StoryLength } from "./types";

/** Limite de caracteres da legenda. */
export const CAPTION_LIMIT = 2200;
/** Limite de hashtags por post (desde dezembro de 2025). */
export const MAX_HASHTAGS = 5;
/** Quanto da legenda aparece no feed antes do "mais", aproximadamente. */
export const FEED_PREVIEW_CHARS = 125;

/** Conta caracteres como a pessoa vê (um emoji conta como um). */
export function charCount(s: string): number {
  return Array.from(s).length;
}

/** O trecho que aparece no feed antes do "mais": a primeira linha, cortada em ~125 caracteres. */
export function feedExcerpt(caption: string): { shown: string; truncated: boolean } {
  const full = caption.trim();
  const chars = Array.from(full);
  const lineEnd = chars.indexOf("\n");
  let cut = lineEnd >= 0 ? lineEnd : chars.length;
  if (cut > FEED_PREVIEW_CHARS) {
    const space = chars.lastIndexOf(" ", FEED_PREVIEW_CHARS);
    cut = space > 60 ? space : FEED_PREVIEW_CHARS;
  }
  return { shown: chars.slice(0, cut).join("").trimEnd(), truncated: cut < chars.length };
}

export interface PostSummary {
  draft: Draft;
  music?: MusicPick;
  place?: PlacePick;
  altText: string;
}

export function musicLabel(m: MusicPick): string {
  return m.artist ? `${m.title} – ${m.artist}` : m.title;
}

/** Conteúdo do arquivo de texto que acompanha as fotos. As hashtags ficam fora da legenda, para o primeiro comentário. */
export function postText(p: PostSummary): string {
  const parts = ["LEGENDA", p.draft.text.trim()];
  if (p.draft.hashtags.length) {
    parts.push("", "HASHTAGS OCULTAS (cole no primeiro comentário)", p.draft.hashtags.join(" "));
  }
  if (p.music) parts.push("", "MÚSICA", musicLabel(p.music) + (p.music.part ? ` (${p.music.part})` : ""));
  if (p.place) parts.push("", "LOCALIZAÇÃO", p.place.name);
  if (p.altText.trim()) parts.push("", "TEXTO ALTERNATIVO", p.altText.trim());
  return parts.join("\n") + "\n";
}

// ===== Stories =====

/** Palavras do texto de cada tela: de `from` a `to`, no máximo `max`. */
export const STORY_WORDS: Record<StoryLength, { from: number; to: number; max: number }> = {
  // curto o bastante para ler num relance: cada tela fica uns 5 segundos
  short: { from: 3, to: 8, max: 12 },
  // para contar mais; quem assiste pode segurar a tela para ler, e a letra diminui para caber
  long: { from: 12, to: 25, max: 30 },
};

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** Nomes das figurinhas como aparecem no Instagram. */
export const STICKER_LABELS: Record<StickerKind, string> = {
  poll: "Enquete",
  question: "Caixa de perguntas",
  quiz: "Quiz",
  slider: "Slider de emoji",
  countdown: "Contagem regressiva",
  link: "Link",
  "add-yours": "Adicione o seu",
};

/** "Enquete: Qual o melhor tema? (Dinossauro / Princesa)". No quiz, marca a resposta certa. */
export function stickerSummary(s: Sticker): string {
  const options =
    s.kind === "quiz"
      ? s.options.map((o, i) => (i === 0 ? `${o} (certa)` : o))
      : s.kind === "poll" || s.kind === "slider"
        ? s.options
        : [];
  return `${STICKER_LABELS[s.kind]}: ${s.text}${options.length ? ` (${options.join(" / ")})` : ""}`;
}

// ===== Dois trechos com fontes diferentes =====

// palavras que não ficam bem no fim do primeiro trecho
const LINKING_WORDS = new Set(
  "a o as os um uma uns umas de da do das dos na no nas nos em e ou com sem para pra por pelo pela que se".split(" "),
);
const DASH = /^[–—-]$/;

/**
 * Divide o texto em dois trechos num ponto natural perto do meio: depois de uma pontuação ou num travessão; sem
 * nenhum, no meio, sem deixar "de", "e" etc. no fim do primeiro trecho. Texto curto sem pontuação fica inteiro.
 */
export function splitInTwo(text: string): [string, string] {
  const t = text.trim();
  if (t.includes("\n")) {
    const [first, ...rest] = t.split("\n");
    return [first.trim(), rest.join(" ").replace(/\s+/g, " ").trim()];
  }
  const words = t.split(/\s+/).filter(Boolean);
  const target = words.length / 2;
  let cut = 0;
  for (let i = 1; i < words.length; i++) {
    const natural = /[.!?…:;,]$/.test(words[i - 1]) || DASH.test(words[i - 1]) || DASH.test(words[i]);
    if (natural && (!cut || Math.abs(i - target) < Math.abs(cut - target))) cut = i;
  }
  if (!cut && words.length >= 4) {
    cut = Math.ceil(target);
    while (cut > 1 && LINKING_WORDS.has(words[cut - 1].toLocaleLowerCase("pt-BR"))) cut--;
  }
  if (!cut) return [t, ""];
  const first = words.slice(0, cut).filter((w, i) => !(DASH.test(w) && i === cut - 1));
  const second = words.slice(cut).filter((w, i) => !(DASH.test(w) && i === 0));
  return [first.join(" ").replace(/[,;:]$/, ""), second.join(" ")];
}

/** Os dois trechos juntos, como um texto só. */
export function bothParts(f: { text: string; text2?: string }, separator = " "): string {
  return [f.text.trim(), f.text2?.trim() ?? ""].filter(Boolean).join(separator);
}

/** Liga ou desliga os dois trechos: ao ligar, divide o texto (se ainda não houver segundo trecho); ao desligar, junta. */
export function withTwoParts<T extends { text: string; text2?: string }>(item: T, on: boolean): T & { text2: string } {
  if (!on) return { ...item, text: bothParts(item), text2: "" };
  if (item.text2?.trim()) return { ...item, text2: item.text2 };
  const [text, text2] = splitInTwo(item.text);
  return { ...item, text, text2 };
}

export interface StoriesSummary {
  frames: StoryFrame[];
  hashtags: string[];
  music?: MusicPick;
  place?: PlacePick;
}

/** Conteúdo do arquivo de texto que acompanha os stories. As hashtags ficam ocultas: escondidas no editor do story. */
export function storiesText(p: StoriesSummary): string {
  const parts: string[] = ["STORIES"];
  p.frames.forEach((f, i) => {
    parts.push(`Tela ${i + 1}: ${f.text.trim() || "(sem texto)"}`);
    if (f.text2?.trim()) parts.push(`  Trecho 2: ${f.text2.trim()}`);
    if (f.sticker) parts.push(`  Figurinha – ${stickerSummary(f.sticker)}`);
  });
  if (p.music) parts.push("", "MÚSICA", musicLabel(p.music) + (p.music.part ? ` (${p.music.part})` : ""));
  if (p.place) parts.push("", "LOCALIZAÇÃO", p.place.name);
  if (p.hashtags.length) {
    parts.push("", "HASHTAGS OCULTAS (cole com Aa, em letra mínima e na cor do fundo)", p.hashtags.join(" "));
  }
  return parts.join("\n") + "\n";
}
