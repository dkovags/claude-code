import { describe, expect, it } from "vitest";
import { cropRect, DEFAULT_FRAMING, DEFAULT_OVERLAY, layoutOverlay, pan, wrapLines } from "../../src/post-pronto/render";

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
    expect(l.lines.length).toBeLessThanOrEqual(5);
    expect(l.blockWidth).toBeLessThanOrEqual(1080 * 0.84);
    expect(l.px).toBeLessThan(Math.round(1080 * 0.085));
  });

  it("posiciona embaixo deixando livre a área dos botões nos Stories", () => {
    const feed = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi" }, 1080, 1350, measureWith);
    expect(feed.top + feed.blockHeight).toBeCloseTo(1350 * 0.93);
    const story = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi" }, 1080, 1920, measureWith);
    expect(story.top + story.blockHeight).toBeCloseTo(1920 * 0.8);
    const top = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi", position: "top" }, 1080, 1920, measureWith);
    expect(top.top).toBeCloseTo(1920 * 0.14);
  });

  it("estilo Impacto escreve em maiúsculas", () => {
    const l = layoutOverlay({ ...DEFAULT_OVERLAY, text: "fim de tarde", style: "impact" }, 1080, 1350, measureWith);
    expect(l.lines.join(" ")).toBe("FIM DE TARDE");
  });
});
