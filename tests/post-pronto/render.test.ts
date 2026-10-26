import { describe, expect, it } from "vitest";
import {
  cropRect, DEFAULT_FRAMING, DEFAULT_OVERLAY, fitZoom, formatSpec, layoutOverlay, minZoom, overlayStyles, pan, pinch,
  placePhoto, sameAsBox, sharpness, snapZoom, textBoxes, textColors, textSize, upscale, wrapLines,
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

  it("diminuir o zoom mostra mais da foto: inteira e, no mínimo, um pouco menor", () => {
    // foto deitada no story: inteira, ocupa a largura e fica no meio da altura
    const whole = fitZoom(4000, 3000, 1080, 1920);
    expect(whole).toBeCloseTo(0.421875);
    const fit = placePhoto(4000, 3000, 1080, 1920, { ...DEFAULT_FRAMING, zoom: whole });
    expect([fit.dx, fit.dw, fit.dh]).toEqual([0, 1080, 810]);
    expect(fit.dy).toBeCloseTo(555);
    // no mínimo, 60% da foto inteira; abaixo disso, não diminui mais
    expect(minZoom(4000, 3000, 1080, 1920)).toBeCloseTo(whole * 0.6);
    expect(placePhoto(4000, 3000, 1080, 1920, { ...DEFAULT_FRAMING, zoom: 0.01 }).dw).toBeCloseTo(1080 * 0.6);
    // a mesma foto preenchendo a tela: sobra na largura
    expect(placePhoto(4000, 3000, 1080, 1920, DEFAULT_FRAMING).dh).toBeCloseTo(1920);
    // foto no mesmo formato do quadro: inteira é o mesmo que preencher
    expect(fitZoom(1080, 1920, 1080, 1920)).toBe(1);
  });

  it("pinça: o ponto da foto embaixo dos dedos continua embaixo deles, e a foto acompanha os dedos", () => {
    const at = { x: 0.3, y: 0.4 };
    const before = placePhoto(4000, 3000, 1080, 1350, DEFAULT_FRAMING);
    const zoomed = pinch(DEFAULT_FRAMING, 2, at, at, 4000, 3000, 1080, 1350);
    const after = placePhoto(4000, 3000, 1080, 1350, zoomed);
    expect(zoomed.zoom).toBe(2);
    expect((at.x * 1080 - after.dx) / after.scale).toBeCloseTo((at.x * 1080 - before.dx) / before.scale);
    expect((at.y * 1350 - after.dy) / after.scale).toBeCloseTo((at.y * 1350 - before.dy) / before.scale);
    // sem mudar o zoom, os dedos andando 10% da largura levam a foto junto
    const moved = pinch(DEFAULT_FRAMING, 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 4000, 3000, 1080, 1350);
    expect(placePhoto(4000, 3000, 1080, 1350, moved).dx - before.dx).toBeCloseTo(108);
    // juntar demais os dedos para no menor zoom
    expect(pinch(DEFAULT_FRAMING, 0.01, at, at, 4000, 3000, 1080, 1350).zoom).toBeCloseTo(minZoom(4000, 3000, 1080, 1350));
  });

  it("perto de preencher a tela ou da foto inteira, o zoom encaixa no ponto exato", () => {
    expect(snapZoom(0.997, 0.75)).toBe(1);
    expect(snapZoom(0.754, 0.75)).toBe(0.75);
    expect(snapZoom(0.9, 0.75)).toBe(0.9);
    expect(snapZoom(0.985, 0.75, 0.02)).toBe(1);
  });

  it("com a foto menor que a tela, arrastar muda onde ela fica, sem sair da tela", () => {
    const f = { ...DEFAULT_FRAMING, zoom: fitZoom(4000, 3000, 1080, 1920) };
    const down = pan(f, 0, 0.1, 4000, 3000, 1080, 1920);
    expect(placePhoto(4000, 3000, 1080, 1920, down).dy).toBeCloseTo(555 + 192);
    expect(down.x).toBe(0); // na largura ela ocupa a tela toda: não há para onde ir
    const top = pan(f, 0, -10, 4000, 3000, 1080, 1920);
    expect(placePhoto(4000, 3000, 1080, 1920, top).dy).toBeCloseTo(0);
    // menor que a foto inteira, ela anda nas duas direções
    const small = pan({ ...f, zoom: 0.01 }, 0.1, 0, 4000, 3000, 1080, 1920);
    expect(placePhoto(4000, 3000, 1080, 1920, small).dx).toBeCloseTo((1080 - 648) / 2 + 108);
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
    expect(sharpness(upscale(1280, 960, story, { ...DEFAULT_FRAMING, zoom: fitZoom(1280, 960, 1080, 1920) }))).toBe("ok");
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

  it("o tamanho da letra muda só a letra: as linhas quebram de novo, e o encaixe automático não desfaz o aumento", () => {
    const text = "Primeira ponte fixa sobre o Danúbio em Budapeste, aberta em 1849";
    const at = (size: number) => layoutOverlay({ ...DEFAULT_OVERLAY, text, size }, 1080, 1920, measureWith).blocks[0];
    const auto = at(1);
    // menor: a letra diminui na proporção, e as linhas quebram de novo na largura automática
    const small = at(0.5);
    expect(small.px).toBe(Math.round(auto.px * 0.5));
    expect(small.lines.length).toBeLessThan(auto.lines.length);
    // maior: o encaixe automático (5 linhas, 45% da altura) não desfaz o aumento; a caixa não passa da largura da foto
    const sizes = [1, 1.2, 1.4, 1.6, 1.8, 2].map((s) => at(s));
    sizes.slice(1).forEach((b, i) => expect(b.px).toBeGreaterThan(sizes[i].px));
    for (const b of sizes) expect(b.width + 2 * b.padX).toBeLessThanOrEqual(1080);
    // palavra comprida demais na letra máxima: diminui até caber na foto
    const word = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Supercalifragilisticexpialidocious", size: 2 }, 1080, 1920, measureWith);
    expect(word.blocks[0].width + 2 * word.blocks[0].padX).toBeLessThanOrEqual(1080);
    // caixa alta embaixo: sobe o quanto precisa, sem sair da foto
    const tall = layoutOverlay({ ...DEFAULT_OVERLAY, text: "palavra ".repeat(30).trim(), size: 2 }, 1080, 1920, measureWith);
    const b = tall.blocks[0];
    expect(b.top - b.padY).toBeGreaterThanOrEqual(0);
    expect(b.top + b.height + b.padY).toBeLessThanOrEqual(1920);
    expect(textSize(0.1)).toBe(0.3);
    expect(textSize(5)).toBe(2);
  });

  it("caixa escolhida na prévia: a letra fica, as linhas quebram na largura dela e o texto fica no meio", () => {
    const text = "Primeira ponte fixa sobre o Danúbio em Budapeste, aberta em 1849";
    const center = { x: 0.5, y: 0.5 };
    const free = layoutOverlay({ ...DEFAULT_OVERLAY, text }, 1080, 1920, measureWith).blocks[0];
    // mais estreita e mais alta que o texto: mais linhas, a mesma letra, e a caixa no tamanho e no lugar pedidos
    const narrow = layoutOverlay({ ...DEFAULT_OVERLAY, text, box: { w: 0.6, h: 0.4 }, at: center }, 1080, 1920, measureWith);
    const n = narrow.blocks[0];
    expect(n.px).toBe(free.px);
    expect(n.lines.length).toBeGreaterThan(free.lines.length);
    const [handle] = textBoxes(narrow, 1080, 1920);
    expect(handle.w).toBeCloseTo(0.6);
    expect(handle.h).toBeCloseTo(0.4);
    expect(handle.center.x).toBeCloseTo(0.5);
    expect(handle.center.y).toBeCloseTo(0.5);
    // a letra muda dentro da caixa: maior, mais linhas na mesma largura
    const bigger = layoutOverlay({ ...DEFAULT_OVERLAY, text, size: 1.5, box: { w: 0.6, h: 0.4 }, at: center }, 1080, 1920, measureWith);
    expect(bigger.blocks[0].px).toBeGreaterThan(n.px);
    expect(bigger.blocks[0].lines.length).toBeGreaterThan(n.lines.length);
    // menor do que o texto precisa (a altura, e a largura para "Budapeste,"): a caixa fica do tamanho do texto, a partir
    // do canto de cima à esquerda
    const tiny = layoutOverlay({ ...DEFAULT_OVERLAY, text, box: { w: 0.5, h: 0.01 }, at: center }, 1080, 1920, measureWith);
    const [t] = textBoxes(tiny, 1080, 1920);
    expect(t.h).toBeGreaterThan(0.05);
    expect(t.y).toBeCloseTo(0.495);
    expect(t.x).toBeCloseTo(0.25);
    // sem fundo, a caixa pedida já conta com a folga para pegar a alça
    const plain = layoutOverlay({ ...DEFAULT_OVERLAY, text, bg: "none", box: { w: 0.6, h: 0.45 }, at: center }, 1080, 1920, measureWith);
    const [pb] = textBoxes(plain, 1080, 1920);
    expect(pb.w).toBeCloseTo(0.6);
    expect(pb.h).toBeCloseTo(0.45);
  });

  it("posiciona embaixo deixando livre a área dos botões nos Stories", () => {
    const plain = { ...DEFAULT_OVERLAY, text: "Oi", bg: "none" as const };
    const feed = layoutOverlay(plain, 1080, 1350, measureWith);
    expect(feed.top + feed.height).toBeCloseTo(1350 * 0.93);
    const story = layoutOverlay(plain, 1080, 1920, measureWith);
    expect(story.top + story.height).toBeCloseTo(1920 * 0.8);
    const top = layoutOverlay({ ...plain, position: "top" }, 1080, 1920, measureWith);
    expect(top.top).toBeCloseTo(1920 * 0.14);
    // com caixa (o padrão), é a borda da caixa que fica no limite
    const boxed = layoutOverlay({ ...DEFAULT_OVERLAY, text: "Oi", position: "top" }, 1080, 1920, measureWith).blocks[0];
    expect(boxed.top - boxed.padY).toBeCloseTo(1920 * 0.14);
  });

  it("estilo Impacto escreve em maiúsculas", () => {
    const l = layoutOverlay({ ...DEFAULT_OVERLAY, text: "fim de tarde", style: "impact" }, 1080, 1350, measureWith);
    expect(l.blocks[0].lines.join(" ")).toBe("FIM DE TARDE");
  });

  it("dois trechos: cada um com a sua fonte e o seu tamanho, o segundo logo abaixo do primeiro", () => {
    const o = { ...DEFAULT_OVERLAY, position: "top" as const, bg: "none" as const, text: "Cinco velinhas", style: "impact" as const, text2: "e um dinossauro", style2: "handwritten" as const, size2: 0.7 };
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

  it("cada trecho tem a sua caixa: as duas não se encostam e ficam fora das áreas dos botões", () => {
    const o = { ...DEFAULT_OVERLAY, text: "Por que a bandeira está furada?", text2: "Em 1956", bg: "white" as const, bg2: "translucent" as const };
    const top = layoutOverlay({ ...o, position: "top" }, 1080, 1920, measureWith);
    const [first, second] = top.blocks;
    expect([first.bg, second.bg]).toEqual(["white", "translucent"]);
    expect(first.padY).toBeGreaterThan(0);
    expect(first.top - first.padY).toBeCloseTo(1920 * 0.14);
    const firstBoxEnd = first.top + first.height + first.padY;
    expect(second.top - second.padY - firstBoxEnd).toBeCloseTo(Math.round(Math.min(first.px, second.px) * 0.35));
    const bottom = layoutOverlay(o, 1080, 1920, measureWith);
    const last = bottom.blocks[1];
    expect(last.top + last.height + last.padY).toBeCloseTo(1920 * 0.8);
    const middle = layoutOverlay({ ...o, position: "center" }, 1080, 1920, measureWith);
    const boxTop = middle.blocks[0].top - middle.blocks[0].padY;
    const boxEnd = middle.blocks[1].top + middle.blocks[1].height + middle.blocks[1].padY;
    expect((boxTop + boxEnd) / 2).toBeCloseTo(960);
    // sem fundo, nada muda: sem folga e o mesmo espaço entre os trechos de antes
    const plain = layoutOverlay({ ...o, bg: "none", bg2: "none", position: "top" }, 1080, 1920, measureWith);
    expect(plain.blocks.map((b) => b.padY)).toEqual([0, 0]);
    expect(plain.blocks[0].top).toBeCloseTo(1920 * 0.14);
  });

  it("trecho arrastado na prévia: fica onde foi solto, sem sair da foto; o segundo acompanha o primeiro", () => {
    const o = { ...DEFAULT_OVERLAY, text: "Por que a bandeira está furada?", text2: "Em 1956", bg: "black" as const, bg2: "white" as const };
    const preset = layoutOverlay(o, 1080, 1920, measureWith);
    const gap = preset.blocks[1].top - (preset.blocks[0].top + preset.blocks[0].height);
    // o primeiro arrastado leva o segundo junto, logo abaixo
    const moved = layoutOverlay({ ...o, at: { x: 0.5, y: 0.6 } }, 1080, 1920, measureWith);
    const [a, b] = moved.blocks;
    expect(a.top + a.height / 2).toBeCloseTo(1920 * 0.6);
    expect(b.top).toBeCloseTo(a.top + a.height + gap);
    expect(b.cx).toBeCloseTo(a.cx);
    expect(moved.top).toBeCloseTo(a.top);
    expect(moved.height).toBeCloseTo(b.top + b.height - a.top);
    // arrastado também, o segundo fica sozinho onde foi solto
    const apart = layoutOverlay({ ...o, at: { x: 0.5, y: 0.6 }, at2: { x: 0.3, y: 0.2 } }, 1080, 1920, measureWith);
    expect(apart.blocks[0].top).toBeCloseTo(a.top);
    expect(apart.blocks[1].cx).toBeCloseTo(1080 * 0.3);
    expect(apart.blocks[1].top + apart.blocks[1].height / 2).toBeCloseTo(1920 * 0.2);
    // solto na borda, o conjunto para dentro da foto
    const edge = layoutOverlay({ ...o, at: { x: 0, y: 1 } }, 1080, 1920, measureWith);
    const [e1, e2] = edge.blocks;
    const half = Math.max(e1.width / 2 + e1.padX, e2.width / 2 + e2.padX);
    expect(e1.cx - half).toBeCloseTo(0);
    expect(e2.top + e2.height + e2.padY).toBeCloseTo(1920);
    // a alça para arrastar acompanha o trecho, em fração da foto
    const [box1, box2] = textBoxes(apart, 1080, 1920);
    expect(box1.part).toBe(1);
    expect(box1.center.y).toBeCloseTo(0.6);
    expect(box2.center.x).toBeCloseTo(0.3);
    expect(box2.x + box2.w / 2).toBeCloseTo(0.3);
  });

  it("cada caixa tem a sua cor de texto; a caixa semitransparente acompanha, e a mesma cor da caixa vira a oposta", () => {
    expect(textColors("none", "yellow")).toEqual({ ink: "#ffd43b", box: null });
    expect(textColors("translucent", "white")).toEqual({ ink: "#ffffff", box: "rgba(12, 12, 14, 0.55)" });
    expect(textColors("translucent", "red")).toEqual({ ink: "#e5383b", box: "rgba(12, 12, 14, 0.55)" });
    expect(textColors("translucent", "black")).toEqual({ ink: "#111111", box: "rgba(255, 255, 255, 0.78)" });
    expect(textColors("white", "blue")).toEqual({ ink: "#3a86ff", box: "#ffffff" });
    expect(textColors("white", "white")).toEqual({ ink: "#111111", box: "#ffffff" });
    expect(textColors("black", "black")).toEqual({ ink: "#ffffff", box: "#111111" });
    expect([sameAsBox("white", "white"), sameAsBox("translucent", "white"), sameAsBox("black", "yellow")]).toEqual([true, false, false]);
    // por padrão, as cores se alternam: título branco numa caixa escura, explicação preta numa caixa clara
    const d = DEFAULT_OVERLAY;
    expect([d.color, d.bg, d.color2, d.bg2]).toEqual(["white", "translucent", "black", "translucent"]);
    const blocks = layoutOverlay({ ...d, text: "Título", text2: "Explicação" }, 1080, 1920, measureWith).blocks;
    expect(blocks.map((b) => textColors(b.bg, b.color))).toEqual([
      { ink: "#ffffff", box: "rgba(12, 12, 14, 0.55)" },
      { ink: "#111111", box: "rgba(255, 255, 255, 0.78)" },
    ]);
  });
});
