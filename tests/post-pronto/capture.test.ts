import { describe, expect, it } from "vitest";
import { captureName, captureScale } from "../../src/post-pronto/capture";

describe("imagem da tela", () => {
  it("usa a densidade da tela, até 2x", () => {
    expect(captureScale(1240, 3000, 1)).toBe(1);
    expect(captureScale(390, 4000, 3)).toBe(2);
  });

  it("diminui a densidade quando a página é comprida demais para o celular", () => {
    const scale = captureScale(390, 20000, 3);
    expect(390 * 20000 * scale ** 2).toBeLessThanOrEqual(16_000_000);
    expect(40000 * captureScale(390, 40000, 3)).toBeLessThanOrEqual(32_000);
    expect(captureScale(390, 400000, 3)).toBe(0.5);
  });

  it("dá ao arquivo a data e a hora", () => {
    expect(captureName(new Date(2026, 9, 24, 9, 5))).toBe("post-pronto-tela-2026-10-24-0905.png");
  });
});
