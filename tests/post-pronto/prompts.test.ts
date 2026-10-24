import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF } from "../../src/post-pronto/brief";
import {
  buildRefinePrompt, buildSuggestPrompt, cleanHashtags, fixDashes, formatTakenAt, normalizeRefine,
  normalizeSuggestions, splitTrailingHashtags, SUGGEST_SCHEMA, type SuggestRequest,
} from "../../src/post-pronto/prompts";

const base: SuggestRequest = {
  brief: { ...DEFAULT_BRIEF, context: "Aniversário de 5 anos da Ana, na casa da vó", profile: "Perfil pessoal" },
  photoCount: 2,
  attachedCount: 2,
  metas: [{ takenAt: "2026-03-12T18:40:05", lat: -22.953428, lon: -43.210487 }, {}],
  answers: [],
  allowQuestions: true,
  avoid: [],
  today: "24/10/2026",
};

describe("buildSuggestPrompt", () => {
  it("leva o contexto, os dados das fotos e as regras do Instagram", () => {
    const p = buildSuggestPrompt(base);
    expect(p).toContain("Aniversário de 5 anos da Ana");
    expect(p).toContain("2 fotos, na ordem do carrossel (a primeira é a capa)");
    expect(p).toContain("Foto 1: tirada em 12/03/2026, 18h40; coordenadas GPS -22.95343, -43.21049");
    expect(p).not.toContain("Foto 2:");
    expect(p).toContain("no máximo 125 caracteres");
    expect(p).toContain("o Instagram aceita no máximo 5");
    expect(p).toContain("Nunca use travessão (—)");
    expect(p).toContain('responda com status "perguntas"');
  });

  it("depois das perguntas, proíbe novas perguntas e inclui as respostas", () => {
    const p = buildSuggestPrompt({
      ...base,
      allowQuestions: false,
      answers: [{ question: "Qual é a ocasião?", answer: "Festa surpresa" }],
    });
    expect(p).toContain("Não faça perguntas.");
    expect(p).toContain("Pergunta: Qual é a ocasião?");
    expect(p).toContain("Resposta: Festa surpresa");
  });

  it("avisa quando só parte das fotos foi anexada e pede opções novas", () => {
    const p = buildSuggestPrompt({ ...base, photoCount: 12, attachedCount: 10, avoid: ["Primeira linha antiga\nresto"] });
    expect(p).toContain("Só as 10 primeiras estão anexadas");
    expect(p).toContain("• Primeira linha antiga");
    expect(p).not.toContain("resto");
  });

  it("o formato pedido no texto bate com o esquema enviado à API", () => {
    const p = buildSuggestPrompt(base);
    for (const field of SUGGEST_SCHEMA.required) expect(p).toContain(`"${field}"`);
  });
});

describe("buildRefinePrompt", () => {
  it("leva a legenda atual, as hashtags e o pedido", () => {
    const p = buildRefinePrompt({
      brief: DEFAULT_BRIEF,
      analysis: "Bolo de dinossauro",
      draft: { text: "Cinco anos!", hashtags: ["#aniversario"] },
      instruction: "Mais curta",
    });
    expect(p).toContain("Cinco anos!");
    expect(p).toContain("#aniversario");
    expect(p).toContain("PEDIDO\nMais curta");
    expect(p).toContain("Bolo de dinossauro");
  });
});

describe("leitura das respostas", () => {
  it("troca travessão por meia-risca", () => {
    expect(fixDashes("Sol — mar ― céu")).toBe("Sol – mar – céu");
  });

  it("limpa hashtags: junta espaços, separa várias num item, tira repetidas e limita a 5", () => {
    expect(cleanHashtags(["#praia de copacabana", "pordosol", "#a #b", "#PorDoSol", "#2026", 3, "#ç_ão!"])).toEqual([
      "#praiadecopacabana",
      "#pordosol",
      "#a",
      "#b",
      "#ç_ão",
    ]);
    expect(cleanHashtags(["#um", "#dois", "#tres", "#quatro", "#cinco", "#seis"])).toHaveLength(5);
  });

  it("tira hashtags do fim do texto", () => {
    expect(splitTrailingHashtags("Que dia!\n\n#praia #sol\n#verao")).toEqual({
      text: "Que dia!",
      hashtags: ["#praia", "#sol", "#verao"],
    });
    expect(splitTrailingHashtags("Use #semfiltro sempre")).toEqual({ text: "Use #semfiltro sempre", hashtags: [] });
  });

  it("normaliza as sugestões", () => {
    const s = normalizeSuggestions({
      status: "sugestoes",
      analise: "Festa — com bolo",
      perguntas: [],
      legendas: [
        { estilo: "História", texto: "Cinco anos — e muita bagunça\n\n#aniversario", hashtags: ["festa"], por_que: "x" },
        { estilo: "Vazia", texto: "   ", hashtags: [], por_que: "" },
      ],
      texto_imagem: ['"Cinco anos!"'],
      texto_alternativo: "Menina soprando velas.",
      musicas: [{ titulo: "Parabéns da Xuxa", artista: "Xuxa", trecho: "refrão", por_que: "clássico" }, { titulo: "" }],
      localizacoes: [{ nome: "Campinas, São Paulo", tipo: "bairro ou cidade", por_que: "contexto" }],
      dicas: ["Responda os comentários na primeira hora."],
    });
    expect(s.status).toBe("suggestions");
    expect(s.analysis).toBe("Festa – com bolo");
    expect(s.captions).toEqual([
      { style: "História", text: "Cinco anos – e muita bagunça", hashtags: ["#festa", "#aniversario"], why: "x" },
    ]);
    expect(s.overlays).toEqual(["Cinco anos!"]);
    expect(s.music).toHaveLength(1);
    expect(s.places[0].name).toBe("Campinas, São Paulo");
  });

  it("reconhece perguntas e recusa resposta vazia", () => {
    const q = normalizeSuggestions({
      status: "perguntas",
      analise: "Duas pessoas num barco",
      perguntas: [{ pergunta: "Quem são?", opcoes: ["Casal", "Amigos", "", "Família", "Colegas", "Outro"] }],
    });
    expect(q.status).toBe("questions");
    expect(q.questions[0].options).toEqual(["Casal", "Amigos", "Família", "Colegas"]);
    expect(() => normalizeSuggestions({ status: "perguntas", perguntas: [] })).toThrow();
    expect(() => normalizeSuggestions("texto solto")).toThrow();
  });

  it("perguntas sem conteúdo com legendas viram sugestões", () => {
    const s = normalizeSuggestions({ status: "perguntas", perguntas: [], legendas: [{ texto: "Oi", hashtags: [] }] });
    expect(s.status).toBe("suggestions");
    expect(s.captions[0].style).toBe("Opção");
  });

  it("normaliza o ajuste de legenda", () => {
    expect(normalizeRefine({ texto: "Curta — e boa\n#a #b", hashtags: ["#c"] })).toEqual({
      text: "Curta – e boa",
      hashtags: ["#c", "#a", "#b"],
    });
    expect(() => normalizeRefine({ texto: "" })).toThrow();
  });

  it("formata a data da foto", () => {
    expect(formatTakenAt("2026-03-12T08:05:00")).toBe("12/03/2026, 08h05");
  });
});
