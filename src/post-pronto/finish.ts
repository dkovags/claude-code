// Estado da etapa final e o texto que vai escrito em cada foto.
import { DEFAULT_OVERLAY, type FormatId, type Overlay } from "./render";
import type { Destination, StoryFrame } from "./types";

export interface FinishState {
  /** Formato no feed (nos stories é sempre 9:16). */
  format: FormatId;
  /** Escrever texto nas fotos: nos stories, o de cada tela; no feed, um texto na capa. */
  overlayOn: boolean;
  overlay: Overlay;
  /** Música e localização escolhidas (-1 = nenhuma). */
  music: number;
  place: number;
  altText: string;
}

export const INITIAL_FINISH: FinishState = {
  format: "4:5",
  overlayOn: false,
  // em cima: nos stories, deixa o meio e a parte de baixo para as figurinhas
  overlay: { ...DEFAULT_OVERLAY, position: "top" },
  music: 0,
  place: 0,
  altText: "",
};

/** O texto escrito em cada foto (null = foto sem texto). */
export function overlaysFor(
  destination: Destination,
  count: number,
  finish: FinishState,
  frames: StoryFrame[],
): (Overlay | null)[] {
  return Array.from({ length: count }, (_, i) => {
    if (!finish.overlayOn) return null;
    const text = destination === "stories" ? (frames[i]?.text ?? "") : i === 0 ? finish.overlay.text : "";
    return text.trim() ? { ...finish.overlay, text } : null;
  });
}

/** Nomes dos arquivos baixados. */
export function fileNames(destination: Destination, count: number) {
  const base = destination === "stories" ? "story" : "post-pronto";
  return {
    photo: (i: number) => (count === 1 ? `${base}.jpg` : `${base}-${i + 1}.jpg`),
    photosZip: destination === "stories" ? "stories.zip" : "post-pronto-fotos.zip",
    allZip: destination === "stories" ? "stories-completo.zip" : "post-pronto.zip",
    text: destination === "stories" ? "stories.txt" : "legenda.txt",
  };
}
