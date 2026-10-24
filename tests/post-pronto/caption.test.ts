import { describe, expect, it } from "vitest";
import { charCount, feedExcerpt, fullCaption, postText } from "../../src/post-pronto/caption";

describe("legenda", () => {
  it("junta texto e hashtags com uma linha em branco", () => {
    expect(fullCaption({ text: " Olá \n", hashtags: ["#a", "#b"] })).toBe("Olá\n\n#a #b");
    expect(fullCaption({ text: "Olá", hashtags: [] })).toBe("Olá");
    expect(fullCaption({ text: "", hashtags: ["#a"] })).toBe("#a");
  });

  it("conta emoji como um caractere", () => {
    expect(charCount("Sol 🌅")).toBe(5);
  });

  it("mostra no feed só a primeira linha", () => {
    expect(feedExcerpt("Gancho forte\n\nResto da legenda")).toEqual({ shown: "Gancho forte", truncated: true });
    expect(feedExcerpt("Só uma linha")).toEqual({ shown: "Só uma linha", truncated: false });
  });

  it("corta primeira linha longa numa palavra, perto de 125 caracteres", () => {
    const long = "palavra ".repeat(30).trim();
    const { shown, truncated } = feedExcerpt(long);
    expect(truncated).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(125);
    expect(shown.endsWith("palavra")).toBe(true);
  });

  it("monta o arquivo de texto com meia-risca entre música e artista", () => {
    const txt = postText({
      draft: { text: "Legenda", hashtags: ["#x"] },
      music: { title: "Wave", artist: "Tom Jobim", part: "início", why: "" },
      place: { name: "Arpoador, Rio de Janeiro", kind: "", why: "" },
      altText: "Pôr do sol no mar.",
    });
    expect(txt).toBe(
      "LEGENDA\nLegenda\n\n#x\n\nMÚSICA\nWave – Tom Jobim (início)\n\nLOCALIZAÇÃO\nArpoador, Rio de Janeiro\n\n" +
        "TEXTO ALTERNATIVO\nPôr do sol no mar.\n",
    );
    expect(txt).not.toContain("—");
  });
});
