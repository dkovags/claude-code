// Estado da etapa final e o texto que vai escrito em cada foto.
import { DEFAULT_OVERLAY, type FormatId, type Overlay } from "./render";
import type { Destination, StoryFrame } from "./types";

export interface FinishState {
  /** Formato no feed (nos stories é sempre 9:16). */
  format: FormatId;
  /** Escrever texto nas fotos: nos stories, o de cada tela; no feed, um texto na capa. */
  overlayOn: boolean;
  /** Texto em título e explicação, cada um com a sua fonte (a explicação fica no `text2` de cada tela ou do overlay). */
  twoParts: boolean;
  overlay: Overlay;
  /** Música e localização escolhidas (-1 = nenhuma). */
  music: number;
  place: number;
  altText: string;
}

export const INITIAL_FINISH: FinishState = {
  format: "4:5",
  overlayOn: false,
  twoParts: false,
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
    const frame = destination === "stories" ? frames[i] : undefined;
    const source = frame ?? (destination === "feed" && i === 0 ? finish.overlay : undefined);
    const text = source?.text ?? "";
    const text2 = finish.twoParts ? (source?.text2 ?? "") : "";
    // lugar de cada trecho arrastado na prévia: nos stories, o de cada tela; no feed, o da capa
    const at = destination === "stories" ? frame?.textAt : finish.overlay.at;
    const at2 = finish.twoParts ? (destination === "stories" ? frame?.text2At : finish.overlay.at2) : undefined;
    // e o tamanho da caixa escolhido na prévia, do mesmo jeito
    const box = destination === "stories" ? frame?.textBox : finish.overlay.box;
    const box2 = finish.twoParts ? (destination === "stories" ? frame?.text2Box : finish.overlay.box2) : undefined;
    return text.trim() || text2.trim() ? { ...finish.overlay, text, text2, at, at2, box, box2 } : null;
  });
}

/** Nomes dos arquivos baixados. */
export function fileNames(destination: Destination, count: number) {
  const base = destination === "stories" ? "story" : "post-pronto";
  return {
    photo: (i: number) => (count === 1 ? `${base}.png` : `${base}-${i + 1}.png`),
    photosZip: destination === "stories" ? "stories.zip" : "post-pronto-fotos.zip",
    allZip: destination === "stories" ? "stories-completo.zip" : "post-pronto.zip",
    text: destination === "stories" ? "stories.txt" : "legenda.txt",
  };
}
