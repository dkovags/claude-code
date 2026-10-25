import { describe, expect, it } from "vitest";
import { charCount, feedExcerpt, postText } from "../../src/post-pronto/caption";

describe("legenda", () => {
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

  it("monta o arquivo de texto com as hashtags fora da legenda e meia-risca entre música e artista", () => {
    const txt = postText({
      draft: { text: " Legenda \n", hashtags: ["#x", "#y"] },
      music: { title: "Wave", artist: "Tom Jobim", part: "início", why: "" },
      place: { name: "Arpoador, Rio de Janeiro", kind: "", why: "" },
      altText: "Pôr do sol no mar.",
    });
    expect(txt).toBe(
      "LEGENDA\nLegenda\n\nHASHTAGS OCULTAS (cole no primeiro comentário)\n#x #y\n\n" +
        "MÚSICA\nWave – Tom Jobim (início)\n\nLOCALIZAÇÃO\nArpoador, Rio de Janeiro\n\nTEXTO ALTERNATIVO\nPôr do sol no mar.\n",
    );
    expect(txt).not.toContain("—");
    expect(postText({ draft: { text: "Legenda", hashtags: [] }, altText: "" })).toBe("LEGENDA\nLegenda\n");
  });
});
