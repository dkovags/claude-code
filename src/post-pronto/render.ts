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

/**
 * Como a foto entra no quadro. Com zoom 1, ela preenche o quadro e as sobras ficam de fora; acima de 1, aproxima;
 * abaixo de 1, mostra mais da foto, até ela inteira (`fitZoom`) e um pouco menor, e o espaço que falta é preenchido
 * com a própria foto, desfocada.
 */
export interface Framing {
  zoom: number;
  /**
   * -1 a 1 (0 = centro). Na direção em que a foto sobra, escolhe a parte que aparece; na direção em que ela não ocupa o
   * quadro todo, onde ela fica.
   */
  x: number;
  y: number;
}

export const DEFAULT_FRAMING: Framing = { zoom: 1, x: 0, y: 0 };
export const MAX_ZOOM = 3;

const clamp = (v: number, min = -1, max = 1) => Math.min(max, Math.max(min, v));

/** O zoom em que a foto aparece inteira no quadro (1 quando ela tem o mesmo formato do quadro). */
export function fitZoom(imgW: number, imgH: number, outW: number, outH: number): number {
  return Math.min(outW / imgW, outH / imgH) / Math.max(outW / imgW, outH / imgH);
}

/** O menor zoom: a foto inteira e um pouco menor, para sobrar espaço para o texto em volta. */
export function minZoom(imgW: number, imgH: number, outW: number, outH: number): number {
  return fitZoom(imgW, imgH, outW, outH) * 0.6;
}

/** Onde a foto fica no quadro, em pixels do quadro, e quantos pixels do quadro cada pixel da foto ocupa. */
export function placePhoto(imgW: number, imgH: number, outW: number, outH: number, f: Framing) {
  const zoom = clamp(f.zoom, minZoom(imgW, imgH, outW, outH), MAX_ZOOM);
  const scale = Math.max(outW / imgW, outH / imgH) * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  return { scale, dx: ((outW - dw) * (clamp(f.x) + 1)) / 2, dy: ((outH - dh) * (clamp(f.y) + 1)) / 2, dw, dh };
}

/** Perto de preencher o quadro (1) ou da foto inteira, o zoom encaixa no ponto exato (sem fiapos de fundo desfocado). */
export function snapZoom(zoom: number, whole: number, tolerance = 0.006): number {
  return Math.abs(zoom - 1) < tolerance ? 1 : Math.abs(zoom - whole) < tolerance ? whole : zoom;
}

/**
 * Zoom com pinça: muda o zoom mantendo embaixo dos dedos o mesmo ponto da foto, que acompanha o meio dos dedos.
 * `from` e `to` são o meio dos dedos no começo do gesto e agora, em fração do quadro.
 */
export function pinch(
  start: Framing,
  zoom: number,
  from: Spot,
  to: Spot,
  imgW: number,
  imgH: number,
  outW: number,
  outH: number,
): Framing {
  const p0 = placePhoto(imgW, imgH, outW, outH, start);
  const next = { ...start, zoom: clamp(zoom, minZoom(imgW, imgH, outW, outH), MAX_ZOOM) };
  const p = placePhoto(imgW, imgH, outW, outH, next);
  // o ponto da foto que estava embaixo dos dedos vai para onde os dedos estão agora
  const dx = to.x * outW - ((from.x * outW - p0.dx) / p0.scale) * p.scale;
  const dy = to.y * outH - ((from.y * outH - p0.dy) / p0.scale) * p.scale;
  const slackX = outW - p.dw;
  const slackY = outH - p.dh;
  return {
    ...next,
    x: Math.abs(slackX) > 0.5 ? clamp((2 * dx) / slackX - 1) : 0,
    y: Math.abs(slackY) > 0.5 ? clamp((2 * dy) / slackY - 1) : 0,
  };
}

/** Parte da foto (em pixels da foto) que aparece no quadro quando ela o preenche (zoom de 1 a 3). */
export function cropRect(imgW: number, imgH: number, outW: number, outH: number, f: Framing) {
  const scale = Math.max(outW / imgW, outH / imgH) * clamp(f.zoom, 1, MAX_ZOOM);
  const sw = outW / scale;
  const sh = outH / scale;
  return { sx: ((imgW - sw) * (clamp(f.x) + 1)) / 2, sy: ((imgH - sh) * (clamp(f.y) + 1)) / 2, sw, sh };
}

/**
 * Quanto a foto é ampliada na imagem final: pixels da imagem final para cada pixel da original. Acima de 1, a foto
 * não tem pixels suficientes para o enquadramento (foto pequena, recebida por mensagem, zoom alto ou foto deitada
 * recortada em pé) e perde nitidez.
 */
export function upscale(imgW: number, imgH: number, spec: { w: number; h: number }, f: Framing): number {
  return placePhoto(imgW, imgH, spec.w, spec.h, f).scale;
}

/** Nitidez esperada da foto na imagem baixada, pelo quanto ela é ampliada. */
export function sharpness(factor: number): "ok" | "soft" | "blurry" {
  return factor > 1.6 ? "blurry" : factor > 1.15 ? "soft" : "ok";
}

/**
 * Arrastar a foto: dx e dy em fração do quadro (0,1 = 10% da largura ou da altura). A foto acompanha o dedo, tanto
 * quando sobra (muda a parte que aparece) quanto quando não ocupa o quadro todo (muda onde ela fica).
 */
export function pan(f: Framing, dx: number, dy: number, imgW: number, imgH: number, outW: number, outH: number): Framing {
  const p = placePhoto(imgW, imgH, outW, outH, f);
  // negativo: a foto sobra; positivo: falta foto
  const slackX = outW - p.dw;
  const slackY = outH - p.dh;
  return {
    ...f,
    x: Math.abs(slackX) > 0.5 ? clamp(f.x + (2 * dx * outW) / slackX) : 0,
    y: Math.abs(slackY) > 0.5 ? clamp(f.y + (2 * dy * outH) / slackY) : 0,
  };
}

export type OverlayStyle = "modern" | "editorial" | "handwritten" | "impact";

/** Fundo de cada trecho: nenhum (o texto ganha sombra), caixa semitransparente, branca ou preta. */
export type TextBg = "none" | "translucent" | "white" | "black";

export const TEXT_BG_LABELS: Record<TextBg, string> = {
  none: "Sem fundo",
  // hífen opcional: na coluna estreita do celular, quebra em "Semi-" e "transparente"
  translucent: "Semi\u00adtransparente",
  white: "Branco",
  black: "Preto",
};

/** Cores do texto de cada caixa. */
export type TextColor = "white" | "black" | "yellow" | "red" | "green" | "blue";

export const TEXT_COLORS: Record<TextColor, { label: string; hex: string }> = {
  white: { label: "Branco", hex: "#ffffff" },
  black: { label: "Preto", hex: "#111111" },
  yellow: { label: "Amarelo", hex: "#ffd43b" },
  red: { label: "Vermelho", hex: "#e5383b" },
  green: { label: "Verde", hex: "#2b9348" },
  blue: { label: "Azul", hex: "#3a86ff" },
};

/** Um ponto na foto, em fração da largura e da altura (0,5 e 0,5 é o centro). */
export interface Spot {
  x: number;
  y: number;
}

export interface Overlay {
  text: string;
  style: OverlayStyle;
  position: "top" | "center" | "bottom";
  /** Multiplicador do tamanho da letra, de 0,6 a 1,6. */
  size: number;
  /** Cor do texto do título (ou do texto todo, quando não há explicação). */
  color: TextColor;
  /** Caixa atrás do título (ou do texto todo, quando não há explicação). */
  bg: TextBg;
  /** Explicação, logo abaixo do título, com fonte, tamanho e caixa próprios (vazio = só um trecho). */
  text2: string;
  style2: OverlayStyle;
  size2: number;
  color2: TextColor;
  bg2: TextBg;
  /** Centro da caixa do título e da explicação arrastadas na prévia (sem ele, o trecho fica na `position`). */
  at?: Spot;
  at2?: Spot;
}

export const DEFAULT_OVERLAY: Overlay = {
  text: "",
  style: "modern",
  position: "bottom",
  size: 1,
  // as cores se alternam: título branco numa caixa escura, explicação preta numa caixa clara
  color: "white",
  bg: "translucent",
  text2: "",
  // a explicação, mais longa, numa fonte fácil de ler e um pouco menor que o título
  style2: "editorial",
  size2: 0.8,
  color2: "black",
  bg2: "translucent",
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

/** Um trecho do texto já medido: fonte, linhas, lugar na foto e a caixa atrás dele. */
export interface OverlayBlock {
  /** Título (1) ou explicação (2). */
  part: 1 | 2;
  font: string;
  px: number;
  lines: string[];
  lineHeight: number;
  top: number;
  /** Centro na horizontal. */
  cx: number;
  width: number;
  height: number;
  bg: TextBg;
  color: TextColor;
  /** Folga da caixa em volta do texto (zero sem fundo). */
  padX: number;
  padY: number;
}

export interface OverlayLayout {
  /** Um ou dois trechos, um embaixo do outro. */
  blocks: OverlayBlock[];
  /** Topo, largura e altura do conjunto. */
  top: number;
  width: number;
  height: number;
}

/**
 * Calcula fonte, linhas e posição de cada trecho do texto. Diminui a letra até caber: no máximo 5 linhas e 45% da
 * altura com um trecho, 7 linhas e 55% com dois. Em 9:16 deixa livres o topo e a base, onde ficam os botões dos Stories.
 */
export function layoutOverlay(
  o: Overlay,
  W: number,
  H: number,
  measureWith: (font: string, s: string) => number,
): OverlayLayout {
  const parts = [
    { part: 1 as const, text: o.text, style: o.style, size: o.size, bg: o.bg, color: o.color, at: o.at },
    { part: 2 as const, text: o.text2, style: o.style2, size: o.size2, bg: o.bg2, color: o.color2, at: o.at2 },
  ].filter((p) => p.text.trim());
  const two = parts.length > 1;
  const maxWidth = W * 0.84;
  const minPx = Math.round(W * 0.03);
  const maxLines = two ? 7 : 5;
  const maxHeight = H * (two ? 0.55 : 0.45);
  const sizes = parts.map((p) => Math.max(minPx, Math.round(W * 0.085 * Math.min(1.6, Math.max(0.6, p.size)))));
  let blocks: OverlayBlock[] = [];
  let gap = 0;
  for (;;) {
    blocks = parts.map((p, i) => {
      const style = OVERLAY_STYLES[p.style];
      const px = sizes[i];
      const font = overlayFont(p.style, px);
      const measure = (s: string) => measureWith(font, s);
      const lines = wrapLines(style.upper ? p.text.toLocaleUpperCase("pt-BR") : p.text, maxWidth, measure);
      const lineHeight = px * style.lineHeight;
      const boxed = p.bg !== "none";
      return {
        part: p.part,
        font,
        px,
        lines,
        lineHeight,
        top: 0,
        cx: W / 2,
        width: Math.max(0, ...lines.map(measure)),
        height: lines.length * lineHeight,
        bg: p.bg,
        color: p.color,
        padX: boxed ? px * 0.5 : 0,
        padY: boxed ? px * 0.3 : 0,
      };
    });
    // com caixa, o espaço entre os trechos fica entre as caixas
    gap = two ? Math.round(Math.min(...sizes) * 0.35) + blocks[0].padY + blocks[1].padY : 0;
    const lines = blocks.reduce((n, b) => n + b.lines.length, 0);
    const height = blocks.reduce((h, b) => h + b.height, gap);
    const fits = blocks.every((b) => b.width <= maxWidth) && lines <= maxLines && height <= maxHeight;
    if (fits || sizes.every((px) => px <= minPx)) break;
    sizes.forEach((px, i) => (sizes[i] = Math.max(minPx, Math.floor(px * 0.92))));
  }
  const height = blocks.reduce((h, b) => h + b.height, gap);
  const story = H / W > 1.7;
  const marginTop = H * (story ? 0.14 : 0.07);
  const marginBottom = H * (story ? 0.2 : 0.07);
  // as caixas também ficam fora das áreas dos botões, e no meio é o conjunto com as caixas que fica centralizado
  const padTop = blocks[0]?.padY ?? 0;
  const padBottom = blocks[blocks.length - 1]?.padY ?? 0;
  const top =
    o.position === "top"
      ? marginTop + padTop
      : o.position === "center"
        ? (H - height + padTop - padBottom) / 2
        : H - marginBottom - padBottom - height;
  let y = top;
  for (const b of blocks) {
    b.top = y;
    y += b.height + gap;
  }
  // trechos arrastados na prévia; o segundo acompanha o primeiro até ser arrastado também
  const [first, second] = blocks;
  const atOf = (i: number) => parts[i]?.at;
  if (first && atOf(0)) placeAt(second && !atOf(1) ? [first, second] : [first], atOf(0)!, gap, W, H);
  if (second && atOf(1)) placeAt([second], atOf(1)!, gap, W, H);
  if (!blocks.length) return { blocks, top, width: 0, height };
  const start = Math.min(...blocks.map((b) => b.top));
  const end = Math.max(...blocks.map((b) => b.top + b.height));
  return { blocks, top: start, width: Math.max(...blocks.map((b) => b.width)), height: end - start };
}

const within = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v)));

/** Põe um trecho (ou os dois, empilhados) com o centro do primeiro em `at`, sem que as caixas saiam da foto. */
function placeAt(group: OverlayBlock[], at: Spot, gap: number, W: number, H: number) {
  const halfW = Math.max(...group.map((b) => b.width / 2 + b.padX));
  const cx = within(at.x * W, halfW, W - halfW);
  const first = group[0];
  const last = group[group.length - 1];
  const stack = group.reduce((h, b) => h + b.height, gap * (group.length - 1));
  let y = within(at.y * H - first.height / 2, first.padY, H - stack - last.padY);
  for (const b of group) {
    b.cx = cx;
    b.top = y;
    y += b.height + gap;
  }
}

/** A caixa de cada trecho em fração da foto, para arrastar na prévia (com folga para pegar o texto sem fundo). */
export interface TextBox {
  part: 1 | 2;
  /** Canto superior esquerdo, largura e altura. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centro. */
  center: Spot;
}

export function textBoxes(layout: OverlayLayout, W: number, H: number): TextBox[] {
  return layout.blocks.map((b) => {
    const grip = b.bg === "none" ? b.px * 0.3 : 0;
    const w = b.width + 2 * (b.padX + grip);
    const h = b.height + 2 * (b.padY + grip);
    const cy = b.top + b.height / 2;
    return { part: b.part, x: (b.cx - w / 2) / W, y: (cy - h / 2) / H, w: w / W, h: h / H, center: { x: b.cx / W, y: cy / H } };
  });
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

/**
 * Cores de um trecho: a do texto e a da caixa atrás dele (sem fundo, não há caixa e o texto ganha sombra). A caixa
 * semitransparente é clara atrás do texto preto e escura atrás das outras cores; texto da mesma cor da caixa branca ou
 * preta fica na cor oposta, para não sumir.
 */
export function textColors(bg: TextBg, color: TextColor): { ink: string; box: string | null } {
  const dark = color === "black";
  const ink = (c: TextColor) => TEXT_COLORS[c].hex;
  switch (bg) {
    case "white":
      return { ink: ink(color === "white" ? "black" : color), box: "#ffffff" };
    case "black":
      return { ink: ink(color === "black" ? "white" : color), box: "#111111" };
    case "translucent":
      return { ink: ink(color), box: dark ? "rgba(255, 255, 255, 0.78)" : "rgba(12, 12, 14, 0.55)" };
    default:
      return { ink: ink(color), box: null };
  }
}

/** Texto da mesma cor da caixa branca ou preta: a cor escolhida não vale (ele fica na cor oposta). */
export const sameAsBox = (bg: TextBg, color: TextColor) => (bg === "white" || bg === "black") && bg === color;

/** Escreve o texto na foto e devolve onde ficou cada trecho. */
export function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, W: number, H: number): OverlayLayout {
  const layout = layoutOverlay(o, W, H, (font, s) => {
    ctx.font = font;
    return ctx.measureText(s).width;
  });
  if (!layout.blocks.length) return layout;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // cada trecho com a sua caixa
  for (const b of layout.blocks) {
    const { ink, box } = textColors(b.bg, b.color);
    ctx.shadowColor = "transparent";
    if (box) {
      ctx.fillStyle = box;
      roundRect(ctx, b.cx - b.width / 2 - b.padX, b.top - b.padY, b.width + b.padX * 2, b.height + b.padY * 2, b.px * 0.28);
      ctx.fill();
    } else {
      ctx.shadowColor = b.color === "black" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = b.px * 0.4;
      ctx.shadowOffsetY = b.px * 0.04;
    }
    ctx.fillStyle = ink;
    ctx.font = b.font;
    b.lines.forEach((line, i) => ctx.fillText(line, b.cx, b.top + b.lineHeight * (i + 0.5)));
  }
  ctx.restore();
  return layout;
}

/** Desenha a foto no quadro W×H com o enquadramento e, se houver, o texto (devolve onde ficou cada trecho). */
export function drawPost(
  ctx: CanvasRenderingContext2D,
  img: Source,
  imgW: number,
  imgH: number,
  W: number,
  H: number,
  framing: Framing,
  overlay: Overlay | null,
): OverlayLayout | null {
  ctx.fillStyle = "#ffffff"; // fundo para PNG com transparência (o JPEG não tem)
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const p = placePhoto(imgW, imgH, W, H, framing);
  // só a parte da foto que cai no quadro; se ela não ocupa o quadro todo, o resto fica com a foto desfocada
  const x0 = Math.max(0, p.dx);
  const y0 = Math.max(0, p.dy);
  const x1 = Math.min(W, p.dx + p.dw);
  const y1 = Math.min(H, p.dy + p.dh);
  if (x0 > 0.5 || y0 > 0.5 || x1 < W - 0.5 || y1 < H - 0.5) drawBlurredBackground(ctx, img, imgW, imgH, W, H);
  if (x1 > x0 && y1 > y0) {
    const sx = (x0 - p.dx) / p.scale;
    const sy = (y0 - p.dy) / p.scale;
    ctx.drawImage(img, sx, sy, (x1 - x0) / p.scale, (y1 - y0) / p.scale, x0, y0, x1 - x0, y1 - y0);
  }
  return overlay ? drawOverlay(ctx, overlay, W, H) : null;
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.95),
  );
}

/** As fontes que o texto usa: a do primeiro trecho e, se houver segundo trecho, a dele. */
export function overlayStyles(o: Overlay): OverlayStyle[] {
  return o.text2.trim() && o.style2 !== o.style ? [o.style, o.style2] : [o.style];
}

/** Carrega as fontes do texto antes de desenhar (as fontes da web só baixam quando usadas). */
export async function ensureOverlayFonts(o: Overlay): Promise<void> {
  await Promise.all(
    overlayStyles(o).map(async (style) => {
      try {
        await document.fonts.load(overlayFont(style, 64), "Ág");
      } catch {
        // sem a fonte, o navegador usa a alternativa da lista
      }
    }),
  );
}
