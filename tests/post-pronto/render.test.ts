import { describe, expect, it } from "vitest";
import {
  cropRect, DEFAULT_FRAMING, DEFAULT_OVERLAY, formatSpec, layoutOverlay, overlayStyles, pan, sharpness, upscale,
  wrapLines,
} from "../../src/post-pronto/render";

// largura fictícia: cada caractere mede 0,5 do tamanho da fonte
const measureWith = (font: string, s: string) => s.length * 0.5 * Number(/(\d+)px/.exec(font)![1]);

describe("enquadramento", () => {
  it("recorta a foto de paisagem no centro para o formato 4:5", () => {
    const r = cropRect(4000, 3000, 1080, 1350, DEFAULT_FRAMING);
    expect(r.sh).toBeCloseTo(3000);
    expect(r.sw).toBeCloseTo(2400);
    expect(r.sx).toBeCloseTo(800);
    expect(r.sy).toBeCloseTo(0);
  });

  it("move o recorte até a borda e não passa dela", () => {
    const right = cropRect(4000, 3000, 1080, 1350, { ...DEFAULT_FRAMING, x: 1 });
    expect(right.sx + right.sw).toBeCloseTo(4000);
    const f = pan(DEFAULT_FRAMING, -10, 0, 4000, 3000, 1080, 1350);
    expect(f.x).toBe(1);
    expect(f.y).toBe(0); // na vertical não sobra nada para mover
  });

  it("arrastar meio quadro para a esquerda anda metade da largura do recorte", () => {
    const f = pan(DEFAULT_FRAMING, -0.1, 0, 4000, 3000, 1080, 1350);
    const before = cropRect(4000, 3000, 1080, 1350, DEFAULT_FRAMING);
    const after = cropRect(4000, 3000, 1080, 1350, f);
    expect(after.sx - before.sx).toBeCloseTo(0.1 * before.sw);
  });

  it("o zoom aproxima mantendo o centro", () => {
    const r = cropRect(3000, 3000, 1080, 1080, { ...DEFAULT_FRAMING, zoom: 2 });
    expect(r.sw).toBeCloseTo(1500);
    expect(r.sx).toBeCloseTo(750);
  });
});

describe("nitidez da foto baixada", () => {
  const story = formatSpec("9:16");

  it("foto do celular em pé: sobra resolução para o story", () => {
    const f = upscale(3024, 4032, story, DEFAULT_FRAMING);
    expect(f).toBeCloseTo(1080 / 2268);
    expect(sharpness(f)).toBe("ok");
  });

  it("foto pequena e deitada (como as de mensagem) recortada em pé fica borrada; inteira, não", () => {
    expect(upscale(1280, 960, story, DEFAULT_FRAMING)).toBeCloseTo(2);
    expect(sharpness(upscale(1280, 960, story, DEFAULT_FRAMING))).toBe("blurry");
    expect(sharpness(upscale(1280, 960, story, { ...DEFAULT_FRAMING, mode: "fit" }))).toBe("ok");
  });

  it("o zoom amplia a foto", () => {
    expect(sharpness(upscale(4000, 3000, story, DEFAULT_FRAMING))).toBe("ok");
    expect(sharpness(upscale(4000, 3000, story, { ...DEFAULT_FRAMING, zoom: 3 }))).toBe("blurry");
    expect(sharpness(1.3)).toBe("soft");
  });
});

describe("texto na foto", () => {
  it("quebra em linhas pela largura e respeita quebras manuais", () => {
    const m = (s: string) => s.length;
    expect(wrapLines("um dois três quatro", 9, m)).toEqual(["um dois", "três", "quatro"]);
    expect(wrapLines("linha um\nlinha dois", 100, m)).toEqual(["linha um", "linha dois"]);
    expect(wrapLines("supercalifragilístico", 5, m)).toEqual(["supercalifragilístico"]);
  });

  it("diminui a letra até caber em no máximo 5 linhas", () => {
    const text = "palavra ".repeat(30).trim();
    const l = layoutOverlay({ ...DEFAULT_OVERLAY, text }, 1080, 1350, measureWith);
    expect(l.blocks).toHaveLength(1);
    expect(l.blocks[0].lines.length).toBeLessThanOrEqual(5);
    expect(l.width).toBeLessThanOrEqual(1080 * 0.84);
    expect(l.blocks[0].px).toBeLessThan(Math.round(1080 * 0.085));
  });

  it("posiciona embaixo deixando livre a área dos botões nos Stories", () => {
    const feed = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi" }, 1080, 1350, measureWith);
    expect(feed.top + feed.height).toBeCloseTo(1350 * 0.93);
    const story = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi" }, 1080, 1920, measureWith);
    expect(story.top + story.height).toBeCloseTo(1920 * 0.8);
    const top = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi", position: "top" }, 1080, 1920, measureWith);
    expect(top.top).toBeCloseTo(1920 * 0.14);
  });

  it("estilo Impacto escreve em maiúsculas", () => {
    const l = layoutOverlay({ ...DEFAULT_OVERLAY, text: "fim de tarde", style: "impact" }, 1080, 1350, measureWith);
    expect(l.blocks[0].lines.join(" ")).toBe("FIM DE TARDE");
  });

  it("dois trechos: cada um com a sua fonte e o seu tamanho, o segundo logo abaixo do primeiro", () => {
    const o = { ...DEFAULT_OVERLAY, position: "top" as const, text: "Cinco velinhas", style: "impact" as const, text2: "e um dinossauro", style2: "handwritten" as const, size2: 0.7 };
    const l = layoutOverlay(o, 1080, 1920, measureWith);
    const [first, second] = l.blocks;
    expect(l.blocks).toHaveLength(2);
    expect(first.font).toContain("Anton");
    expect(second.font).toContain("Caveat");
    expect(second.px).toBeLessThan(first.px);
    expect(first.top).toBeCloseTo(1920 * 0.14);
    expect(second.top).toBeGreaterThan(first.top + first.height);
    expect(l.height).toBeCloseTo(second.top + second.height - first.top);
    expect(overlayStyles(o)).toEqual(["impact", "handwritten"]);
  });

  it("dois trechos longos diminuem juntos até caber; só o segundo trecho também funciona", () => {
    const long = "palavra ".repeat(12).trim();
    const l = layoutOverlay({ ...DEFAULT_OVERLAY, text: long, text2: long }, 1080, 1920, measureWith);
    expect(l.blocks.reduce((n, b) => n + b.lines.length, 0)).toBeLessThanOrEqual(7);
    expect(l.height).toBeLessThanOrEqual(1920 * 0.55);
    // texto demais para caber: a letra para no tamanho mínimo
    const huge = "palavra ".repeat(40).trim();
    const min = layoutOverlay({ ...DEFAULT_OVERLAY, text: huge, text2: huge }, 1080, 1920, measureWith);
    expect(min.blocks.map((b) => b.px)).toEqual([Math.round(1080 * 0.03), Math.round(1080 * 0.03)]);
    const onlySecond = layoutOverlay({ ...DEFAULT_OVERLAY, text: " ", text2: "Oi" }, 1080, 1920, measureWith);
    expect(onlySecond.blocks.map((b) => b.lines)).toEqual([["Oi"]]);
    expect(overlayStyles({ ...DEFAULT_OVERLAY, text: "Oi" })).toEqual(["modern"]);
  });
});
