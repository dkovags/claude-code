import { describe, expect, it } from "vitest";
import { bothParts, splitInTwo, stickerSummary, storiesText, withTwoParts, wordCount } from "../../src/post-pronto/caption";
import { fileNames, INITIAL_FINISH, overlaysFor } from "../../src/post-pronto/finish";

const frames = [
  { text: "Cinco velinhas", sticker: null },
  { text: "  ", sticker: { kind: "poll" as const, text: "Melhor tema?", options: ["Dino", "Fada"] } },
];

describe("texto nas fotos", () => {
  it("nos stories, cada foto leva o texto da sua tela (tela sem texto fica sem)", () => {
    const o = overlaysFor("stories", 3, { ...INITIAL_FINISH, overlayOn: true }, frames);
    expect(o.map((x) => x?.text ?? null)).toEqual(["Cinco velinhas", null, null]);
    expect(o[0]?.position).toBe("top");
  });

  it("no feed, só a capa leva texto; desligado, nenhuma", () => {
    const finish = { ...INITIAL_FINISH, overlayOn: true, overlay: { ...INITIAL_FINISH.overlay, text: "5 anos" } };
    expect(overlaysFor("feed", 2, finish, []).map((x) => x?.text ?? null)).toEqual(["5 anos", null]);
    expect(overlaysFor("feed", 2, { ...finish, overlayOn: false }, [])).toEqual([null, null]);
  });

  it("com dois trechos, o segundo vai junto; desligado, só o primeiro", () => {
    const two = [{ text: "Cinco velinhas", text2: "e um dinossauro", sticker: null }];
    const on = overlaysFor("stories", 1, { ...INITIAL_FINISH, overlayOn: true, twoParts: true }, two);
    expect(on.map((x) => [x?.text, x?.text2])).toEqual([["Cinco velinhas", "e um dinossauro"]]);
    const off = overlaysFor("stories", 1, { ...INITIAL_FINISH, overlayOn: true }, two);
    expect(off[0]?.text2).toBe("");
    const cover = { ...INITIAL_FINISH, overlayOn: true, twoParts: true, overlay: { ...INITIAL_FINISH.overlay, text: "", text2: "Fim" } };
    expect(overlaysFor("feed", 1, cover, [])[0]?.text2).toBe("Fim");
  });

  it("nomeia os arquivos conforme o destino", () => {
    expect(fileNames("stories", 1).photo(0)).toBe("story.jpg");
    expect(fileNames("stories", 3).photo(2)).toBe("story-3.jpg");
    expect(fileNames("stories", 3).photosZip).toBe("stories.zip");
    expect(fileNames("feed", 1).photo(0)).toBe("post-pronto.jpg");
    expect(fileNames("feed", 2).text).toBe("legenda.txt");
  });
});

describe("textos dos stories", () => {
  it("resume as figurinhas como no Instagram, com a resposta certa do quiz", () => {
    expect(stickerSummary({ kind: "poll", text: "Melhor tema?", options: ["Dino", "Fada"] })).toBe(
      "Enquete: Melhor tema? (Dino / Fada)",
    );
    expect(stickerSummary({ kind: "quiz", text: "Quantos anos?", options: ["5", "4"] })).toBe(
      "Quiz: Quantos anos? (5 (certa) / 4)",
    );
    expect(stickerSummary({ kind: "question", text: "Me conta", options: [] })).toBe("Caixa de perguntas: Me conta");
  });

  it("divide o texto em dois trechos num ponto natural", () => {
    expect(splitInTwo("Cinco velinhas – e um dinossauro de chantilly")).toEqual(["Cinco velinhas", "e um dinossauro de chantilly"]);
    expect(splitInTwo("Feliz aniversário, Ana!")).toEqual(["Feliz aniversário", "Ana!"]);
    expect(splitInTwo("Que dia. Que festa linda demais.")).toEqual(["Que dia.", "Que festa linda demais."]);
    expect(splitInTwo("Linha um\nlinha dois\ne três")).toEqual(["Linha um", "linha dois e três"]);
    // sem pontuação: no meio, sem deixar "de", "na" etc. no fim do primeiro trecho
    expect(splitInTwo("Festa de criança na casa da vó")).toEqual(["Festa de criança", "na casa da vó"]);
    expect(splitInTwo("5 anos!")).toEqual(["5 anos!", ""]);
    expect(splitInTwo("   ")).toEqual(["", ""]);
  });

  it("liga e desliga os dois trechos", () => {
    const frame = { text: "Cinco velinhas – e um dinossauro", sticker: null };
    const on = withTwoParts(frame, true);
    expect([on.text, on.text2]).toEqual(["Cinco velinhas", "e um dinossauro"]);
    expect(withTwoParts({ ...on, text2: "editado" }, true).text2).toBe("editado");
    expect(withTwoParts(on, false)).toEqual({ text: "Cinco velinhas e um dinossauro", text2: "", sticker: null });
    expect(bothParts(on, "\n")).toBe("Cinco velinhas\ne um dinossauro");
  });

  it("conta palavras", () => {
    expect(wordCount("  Cinco velinhas e um bolo ")).toBe(5);
    expect(wordCount("   ")).toBe(0);
  });

  it("monta o arquivo de texto com telas, figurinhas, música, local e hashtags", () => {
    const txt = storiesText({
      frames,
      hashtags: ["#festa"],
      music: { title: "Aquarela", artist: "Toquinho", part: "refrão", why: "" },
      place: { name: "Campinas, São Paulo", kind: "", why: "" },
    });
    expect(txt).toBe(
      "STORIES\nTela 1: Cinco velinhas\nTela 2: (sem texto)\n  Figurinha – Enquete: Melhor tema? (Dino / Fada)\n\n" +
        "MÚSICA\nAquarela – Toquinho (refrão)\n\nLOCALIZAÇÃO\nCampinas, São Paulo\n\nHASHTAGS\n#festa\n",
    );
    expect(txt).not.toContain("—");
    expect(storiesText({ frames: [{ text: "Cinco velinhas", text2: "e um bolo", sticker: null }], hashtags: [] })).toBe(
      "STORIES\nTela 1: Cinco velinhas\n  Trecho 2: e um bolo\n",
    );
  });
});
