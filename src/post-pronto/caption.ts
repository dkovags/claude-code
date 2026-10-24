// Regras do Instagram para a legenda e o texto que vai para a área de transferência e para o arquivo.
import type { Draft, MusicPick, PlacePick } from "./types";

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
