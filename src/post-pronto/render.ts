// Montagem da foto final: formato do Instagram, enquadramento e texto opcional sobre a capa.

export type FormatId = "4:5" | "3:4" | "1:1" | "9:16" | "1.91:1";

export interface FormatSpec {
  id: FormatId;
  w: number;
  h: number;
  label: string;
  hint: string;
}

export const FORMATS: FormatSpec[] = [
  { id: "4:5", w: 1080, h: 1350, label: "4:5", hint: "Retrato: o que mais ocupa a tela no feed" },
  { id: "3:4", w: 1080, h: 1440, label: "3:4", hint: "Retrato alto, igual ao recorte da grade do perfil" },
  { id: "1:1", w: 1080, h: 1080, label: "1:1", hint: "Quadrado" },
  { id: "9:16", w: 1080, h: 1920, label: "9:16", hint: "Stories e Reels, tela cheia" },
  { id: "1.91:1", w: 1080, h: 566, label: "1,91:1", hint: "Paisagem, para panorâmicas" },
];

export const formatSpec = (id: FormatId): FormatSpec => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

/** Como a foto entra no quadro: recortando as sobras ou inteira, com fundo desfocado. */
export interface Framing {
  mode: "fill" | "fit";
  /** 1 a 3, só no modo "fill". */
  zoom: number;
  /** -1 a 1: posição do recorte (0 = centro). */
  x: number;
  y: number;
}

export const DEFAULT_FRAMING: Framing = { mode: "fill", zoom: 1, x: 0, y: 0 };

const clamp = (v: number, min = -1, max = 1) => Math.min(max, Math.max(min, v));

/** Parte da foto (em pixels da foto) que aparece no quadro no modo "fill". */
export function cropRect(imgW: number, imgH: number, outW: number, outH: number, f: Framing) {
  const scale = Math.max(outW / imgW, outH / imgH) * clamp(f.zoom, 1, 3);
  const sw = outW / scale;
  const sh = outH / scale;
  return { sx: ((imgW - sw) * (clamp(f.x) + 1)) / 2, sy: ((imgH - sh) * (clamp(f.y) + 1)) / 2, sw, sh };
}

/** Arrastar a foto: dx e dy em fração do quadro (0,1 = 10% da largura ou da altura). */
export function pan(f: Framing, dx: number, dy: number, imgW: number, imgH: number, outW: number, outH: number): Framing {
  const { sw, sh } = cropRect(imgW, imgH, outW, outH, f);
  const slackX = imgW - sw;
  const slackY = imgH - sh;
  return {
    ...f,
    x: slackX > 0.5 ? clamp(f.x - (2 * dx * sw) / slackX) : 0,
    y: slackY > 0.5 ? clamp(f.y - (2 * dy * sh) / slackY) : 0,
  };
}

export type OverlayStyle = "modern" | "editorial" | "handwritten" | "impact";

export interface Overlay {
  text: string;
  style: OverlayStyle;
  position: "top" | "center" | "bottom";
  /** Multiplicador do tamanho da letra, de 0,6 a 1,6. */
  size: number;
  color: "light" | "dark";
  /** Faixa semitransparente atrás do texto. */
  band: boolean;
}

export const DEFAULT_OVERLAY: Overlay = {
  text: "",
  style: "modern",
  position: "bottom",
  size: 1,
  color: "light",
  band: false,
};

export const OVERLAY_STYLES: Record<
  OverlayStyle,
  { label: string; family: string; weight: number; italic: boolean; upper: boolean; lineHeight: number }
> = {
  modern: {
    label: "Moderno",
    family: '"Bricolage Grotesque", "Figtree", system-ui, sans-serif',
    weight: 800,
    italic: false,
    upper: false,
    lineHeight: 1.06,
  },
  editorial: {
    label: "Editorial",
    family: '"DM Serif Display", Georgia, "Times New Roman", serif',
    weight: 400,
    italic: true,
    upper: false,
    lineHeight: 1.1,
  },
  handwritten: {
    label: "Manuscrito",
    family: '"Caveat", "Segoe Print", "Bradley Hand", cursive',
    weight: 700,
    italic: false,
    upper: false,
    lineHeight: 1.0,
  },
  impact: {
    label: "Impacto",
    family: '"Anton", Impact, "Arial Narrow", sans-serif',
    weight: 400,
    italic: false,
    upper: true,
    lineHeight: 1.1,
  },
};

export function overlayFont(style: OverlayStyle, px: number): string {
  const s = OVERLAY_STYLES[style];
  return `${s.italic ? "italic " : ""}${s.weight} ${Math.round(px)}px ${s.family}`;
}

/** Quebra o texto em linhas que caibam na largura (palavras maiores que a linha ficam sozinhas). */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export interface OverlayLayout {
  font: string;
  px: number;
  lines: string[];
  lineHeight: number;
  /** Topo do bloco de texto. */
  top: number;
  blockWidth: number;
  blockHeight: number;
}

/**
 * Calcula fonte, linhas e posição do texto. Diminui a letra até caber (no máximo 5 linhas e 45% da altura).
 * Em 9:16 deixa livres o topo e a base, onde ficam os botões dos Stories.
 */
export function layoutOverlay(
  o: Overlay,
  W: number,
  H: number,
  measureWith: (font: string, s: string) => number,
): OverlayLayout {
  const style = OVERLAY_STYLES[o.style];
  const text = style.upper ? o.text.toLocaleUpperCase("pt-BR") : o.text;
  const maxWidth = W * 0.84;
  const minPx = Math.round(W * 0.03);
  let px = Math.max(minPx, Math.round(W * 0.085 * Math.min(1.6, Math.max(0.6, o.size))));
  let font = overlayFont(o.style, px);
  let lines: string[] = [];
  let widest = 0;
  for (;;) {
    font = overlayFont(o.style, px);
    const measure = (s: string) => measureWith(font, s);
    lines = wrapLines(text, maxWidth, measure);
    widest = Math.max(0, ...lines.map(measure));
    const fits = widest <= maxWidth && lines.length <= 5 && lines.length * px * style.lineHeight <= H * 0.45;
    if (fits || px <= minPx) break;
    px = Math.max(minPx, Math.floor(px * 0.92));
  }
  const lineHeight = px * style.lineHeight;
  const blockHeight = lines.length * lineHeight;
  const story = H / W > 1.7;
  const marginTop = H * (story ? 0.14 : 0.07);
  const marginBottom = H * (story ? 0.2 : 0.07);
  const top =
    o.position === "top" ? marginTop : o.position === "center" ? (H - blockHeight) / 2 : H - marginBottom - blockHeight;
  return { font, px, lines, lineHeight, top, blockWidth: widest, blockHeight };
}

type Source = CanvasImageSource;

/** Fundo desfocado (a própria foto ampliada) para o modo "foto inteira". Funciona em qualquer navegador. */
function drawBlurredBackground(ctx: CanvasRenderingContext2D, img: Source, imgW: number, imgH: number, W: number, H: number) {
  const tiny = document.createElement("canvas");
  tiny.width = 24;
  tiny.height = Math.max(1, Math.round((24 * H) / W));
  const r = cropRect(imgW, imgH, tiny.width, tiny.height, DEFAULT_FRAMING);
  const tctx = tiny.getContext("2d")!;
  tctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, tiny.width, tiny.height);
  const mid = document.createElement("canvas");
  mid.width = Math.max(1, Math.round(W / 6));
  mid.height = Math.max(1, Math.round(H / 6));
  const mctx = mid.getContext("2d")!;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(tiny, 0, 0, mid.width, mid.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, W, H);
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, W: number, H: number) {
  if (!o.text.trim()) return;
  const layout = layoutOverlay(o, W, H, (font, s) => {
    ctx.font = font;
    return ctx.measureText(s).width;
  });
  const light = o.color === "light";
  ctx.save();
  if (o.band) {
    const padX = layout.px * 0.55;
    const padY = layout.px * 0.35;
    ctx.fillStyle = light ? "rgba(12, 12, 14, 0.55)" : "rgba(255, 255, 255, 0.78)";
    roundRect(
      ctx,
      (W - layout.blockWidth) / 2 - padX,
      layout.top - padY,
      layout.blockWidth + padX * 2,
      layout.blockHeight + padY * 2,
      layout.px * 0.28,
    );
    ctx.fill();
  } else {
    ctx.shadowColor = light ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.5)";
    ctx.shadowBlur = layout.px * 0.4;
    ctx.shadowOffsetY = layout.px * 0.04;
  }
  ctx.font = layout.font;
  ctx.fillStyle = light ? "#ffffff" : "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, layout.top + layout.lineHeight * (i + 0.5));
  });
  ctx.restore();
}

/** Desenha a foto no quadro W×H com o enquadramento e, se houver, o texto. */
export function drawPost(
  ctx: CanvasRenderingContext2D,
  img: Source,
  imgW: number,
  imgH: number,
  W: number,
  H: number,
  framing: Framing,
  overlay: Overlay | null,
) {
  ctx.fillStyle = "#ffffff"; // fundo para PNG com transparência (o JPEG não tem)
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (framing.mode === "fill") {
    const r = cropRect(imgW, imgH, W, H, framing);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  } else {
    drawBlurredBackground(ctx, img, imgW, imgH, W, H);
    const s = Math.min(W / imgW, H / imgH);
    const dw = imgW * s;
    const dh = imgH * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  if (overlay) drawOverlay(ctx, overlay, W, H);
}

/** Gera o JPEG final (1080 px de largura) de uma foto. */
export function exportJpeg(
  img: Source,
  imgW: number,
  imgH: number,
  spec: FormatSpec,
  framing: Framing,
  overlay: Overlay | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = spec.w;
  canvas.height = spec.h;
  drawPost(canvas.getContext("2d")!, img, imgW, imgH, spec.w, spec.h, framing, overlay);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.92),
  );
}

/** Carrega a fonte do texto antes de desenhar (as fontes da web só baixam quando usadas). */
export async function ensureOverlayFont(style: OverlayStyle): Promise<void> {
  try {
    await document.fonts.load(overlayFont(style, 64), "Ág");
  } catch {
    // sem a fonte, o navegador usa a alternativa da lista
  }
}
