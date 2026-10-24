// Regras do Instagram para a legenda e o texto que vai para a área de transferência e para o arquivo.
import type { Draft, MusicPick, PlacePick, Sticker, StickerKind, StoryFrame } from "./types";

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

/** Legenda completa para colar no Instagram: texto, linha em branco e hashtags. */
export function fullCaption(d: Draft): string {
  const text = d.text.trim();
  const tags = d.hashtags.join(" ");
  if (!tags) return text;
  return text ? `${text}\n\n${tags}` : tags;
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

/** Conteúdo do arquivo de texto que acompanha as fotos. */
export function postText(p: PostSummary): string {
  const parts = ["LEGENDA", fullCaption(p.draft)];
  if (p.music) parts.push("", "MÚSICA", musicLabel(p.music) + (p.music.part ? ` (${p.music.part})` : ""));
  if (p.place) parts.push("", "LOCALIZAÇÃO", p.place.name);
  if (p.altText.trim()) parts.push("", "TEXTO ALTERNATIVO", p.altText.trim());
  return parts.join("\n") + "\n";
}

// ===== Stories =====

/** Nos stories o texto vai na foto: curto o bastante para ler num relance. */
export const STORY_WORDS_MAX = 12;

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

export interface StoriesSummary {
  frames: StoryFrame[];
  hashtags: string[];
  music?: MusicPick;
  place?: PlacePick;
}

/** Conteúdo do arquivo de texto que acompanha os stories. */
export function storiesText(p: StoriesSummary): string {
  const parts: string[] = ["STORIES"];
  p.frames.forEach((f, i) => {
    parts.push(`Tela ${i + 1}: ${f.text.trim() || "(sem texto)"}`);
    if (f.sticker) parts.push(`  Figurinha – ${stickerSummary(f.sticker)}`);
  });
  if (p.music) parts.push("", "MÚSICA", musicLabel(p.music) + (p.music.part ? ` (${p.music.part})` : ""));
  if (p.place) parts.push("", "LOCALIZAÇÃO", p.place.name);
  if (p.hashtags.length) parts.push("", "HASHTAGS", p.hashtags.join(" "));
  return parts.join("\n") + "\n";
}
