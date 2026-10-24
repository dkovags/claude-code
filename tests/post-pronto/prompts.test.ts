import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF } from "../../src/post-pronto/brief";
import {
  buildRefinePrompt, buildStoryRefinePrompt, buildSuggestPrompt, cleanHashtags, FEED_SCHEMA, fixDashes, formatTakenAt,
  normalizeRefine, normalizeStoryRefine, normalizeSuggestions, splitTrailingHashtags, STORIES_SCHEMA,
  type SuggestRequest,
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
const feed: SuggestRequest = { ...base, brief: { ...base.brief, destination: "feed" } };
const FEED = { destination: "feed" as const, frames: 1 };

describe("buildSuggestPrompt", () => {
  it("o padrão é stories: texto na foto, uma tela por foto e figurinhas", () => {
    const p = buildSuggestPrompt(base);
    expect(p).toContain("Prepare stories do Instagram, uma tela para cada foto");
    expect(p).toContain("TEXTOS DOS STORIES");
    expect(p).toContain("exatamente 2 telas, uma para cada foto, na mesma ordem");
    expect(p).toContain("A primeira tela prende a atenção e a última chama para a ação");
    expect(p).toContain('"enquete", "caixa de perguntas", "quiz"');
    expect(p).toContain("figurinha de música");
    expect(p).toContain("Nunca use travessão (—)");
    expect(p).not.toContain("LEGENDAS");
    for (const field of STORIES_SCHEMA.required) expect(p).toContain(`"${field}"`);
  });

  it("com uma foto só, pede exatamente 1 tela", () => {
    const p = buildSuggestPrompt({ ...base, photoCount: 1, attachedCount: 1, metas: [] });
    expect(p).toContain("exatamente 1 tela, em");
    expect(p).toContain("Prenda a atenção e, se fizer sentido, chame para a ação");
  });

  it("no feed, leva o contexto, os dados das fotos e as regras da legenda", () => {
    const p = buildSuggestPrompt(feed);
    expect(p).toContain("Aniversário de 5 anos da Ana");
    expect(p).toContain("2 fotos, na ordem do carrossel (a primeira é a capa)");
    expect(p).toContain("Foto 1: tirada em 12/03/2026, 18h40; coordenadas GPS -22.95343, -43.21049");
    expect(p).not.toContain("Foto 2:");
    expect(p).toContain("no máximo 125 caracteres");
    expect(p).toContain("o Instagram aceita no máximo 5");
    expect(p).toContain('responda com status "perguntas"');
    expect(p).not.toContain("TEXTOS DOS STORIES");
    for (const field of FEED_SCHEMA.required) expect(p).toContain(`"${field}"`);
  });

  it("o objetivo muda conforme o destino", () => {
    expect(buildSuggestPrompt(base)).toContain("respostas por mensagem e votos e respostas nas figurinhas");
    expect(buildSuggestPrompt(feed)).toContain("puxar conversa e gerar comentários");
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

  it("gera de novo com a informação que a pessoa acrescentou depois de ver as sugestões", () => {
    const p = buildSuggestPrompt({ ...base, update: "  A festa foi surpresa, organizada pela tia Rosa.  " });
    expect(p).toContain("INFORMAÇÃO NOVA");
    expect(p).toContain("com prioridade sobre o resto do contexto");
    expect(p).toContain("\nA festa foi surpresa, organizada pela tia Rosa.");
    expect(p).toContain("Aniversário de 5 anos da Ana");
    expect(buildSuggestPrompt({ ...base, update: "  " })).not.toContain("INFORMAÇÃO NOVA");
    expect(buildSuggestPrompt(base)).not.toContain("INFORMAÇÃO NOVA");
  });

  it("avisa quando só parte das fotos foi anexada e pede opções novas", () => {
    const p = buildSuggestPrompt({ ...feed, photoCount: 12, attachedCount: 10, avoid: ["Primeira linha antiga\nresto"] });
    expect(p).toContain("Só as 10 primeiras estão anexadas");
    expect(p).toContain("• Primeira linha antiga");
    expect(p).not.toContain("resto");
  });
});

describe("pedidos de ajuste", () => {
  it("feed: leva a legenda atual, as hashtags e o pedido", () => {
    const p = buildRefinePrompt({
      brief: { ...DEFAULT_BRIEF, destination: "feed" },
      analysis: "Bolo de dinossauro",
      draft: { text: "Cinco anos!", hashtags: ["#aniversario"] },
      instruction: "Mais curta",
    });
    expect(p).toContain("Cinco anos!");
    expect(p).toContain("#aniversario");
    expect(p).toContain("PEDIDO\nMais curta");
    expect(p).toContain("Bolo de dinossauro");
  });

  it("stories: leva as telas atuais no formato combinado e pede o mesmo número de telas", () => {
    const p = buildStoryRefinePrompt({
      brief: DEFAULT_BRIEF,
      analysis: "Bolo de dinossauro",
      frames: [
        { text: "Cinco anos!", sticker: null },
        { text: "Qual o melhor tema?", sticker: { kind: "poll", text: "Melhor tema?", options: ["Dino", "Fada"] } },
      ],
      instruction: "Mais curtos",
    });
    expect(p).toContain("Reescreva os textos dos stories");
    expect(p).toContain('"tipo": "enquete"');
    expect(p).toContain('"tipo": "nenhuma"');
    expect(p).toContain("Devolva exatamente 2 telas, na mesma ordem.");
    expect(p).toContain("PEDIDO\nMais curtos");
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
    expect(cleanHashtags(["#um", "#dois", "#tres", "#quatro"], 3)).toEqual(["#um", "#dois", "#tres"]);
  });

  it("tira hashtags do fim do texto", () => {
    expect(splitTrailingHashtags("Que dia!\n\n#praia #sol\n#verao")).toEqual({
      text: "Que dia!",
      hashtags: ["#praia", "#sol", "#verao"],
    });
    expect(splitTrailingHashtags("Use #semfiltro sempre")).toEqual({ text: "Use #semfiltro sempre", hashtags: [] });
  });

  it("normaliza as sugestões do feed", () => {
    const s = normalizeSuggestions(
      {
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
      },
      FEED,
    );
    expect(s.status).toBe("suggestions");
    expect(s.analysis).toBe("Festa – com bolo");
    expect(s.captions).toEqual([
      { style: "História", text: "Cinco anos – e muita bagunça", hashtags: ["#festa", "#aniversario"], why: "x" },
    ]);
    expect(s.stories).toEqual([]);
    expect(s.overlays).toEqual(["Cinco anos!"]);
    expect(s.music).toHaveLength(1);
    expect(s.places[0].name).toBe("Campinas, São Paulo");
  });

  it("normaliza as versões dos stories: uma tela por foto e figurinhas válidas", () => {
    const s = normalizeSuggestions(
      {
        status: "sugestoes",
        analise: "Festa",
        versoes: [
          {
            estilo: "Narrativa",
            telas: [
              { texto: "Cinco velinhas — e um dinossauro", figurinha: { tipo: "nenhuma", texto: "", opcoes: [] } },
              { texto: '"Qual o seu tema?"', figurinha: { tipo: "Enquete", texto: "Melhor tema?", opcoes: ["Dino", "Fada", ""] } },
              { texto: "Tela que sobra", figurinha: null },
            ],
            por_que: "Conta e pergunta.",
          },
          {
            estilo: "Curta",
            telas: [{ texto: "5 anos!", figurinha: { tipo: "slider", texto: "Quanto você ama bolo?", opcoes: [] } }],
            por_que: "",
          },
          { estilo: "Sem nada", telas: [{ texto: "" }], por_que: "" },
          {
            estilo: "Figurinhas ruins",
            telas: [
              { texto: "A", figurinha: { tipo: "enquete", texto: "Só uma opção?", opcoes: ["Sim"] } },
              { texto: "B", figurinha: { tipo: "link", texto: "", opcoes: [] } },
            ],
            por_que: "",
          },
        ],
        hashtags: ["#festa", "#dino", "#bolo", "#extra"],
      },
      { destination: "stories", frames: 2 },
    );
    expect(s.status).toBe("suggestions");
    expect(s.stories).toHaveLength(3);
    expect(s.stories[0]).toEqual({
      style: "Narrativa",
      frames: [
        { text: "Cinco velinhas – e um dinossauro", sticker: null },
        { text: "Qual o seu tema?", sticker: { kind: "poll", text: "Melhor tema?", options: ["Dino", "Fada"] } },
      ],
      why: "Conta e pergunta.",
    });
    // faltou uma tela: completa com uma vazia
    expect(s.stories[1].frames).toEqual([
      { text: "5 anos!", sticker: { kind: "slider", text: "Quanto você ama bolo?", options: ["😍"] } },
      { text: "", sticker: null },
    ]);
    // enquete com uma opção só não vale; link sem texto ganha um texto padrão
    expect(s.stories[2].frames.map((f) => f.sticker)).toEqual([null, { kind: "link", text: "Saiba mais", options: [] }]);
    expect(s.hashtags).toEqual(["#festa", "#dino", "#bolo"]);
    expect(s.captions).toEqual([]);
  });

  it("reconhece perguntas e recusa resposta vazia", () => {
    const q = normalizeSuggestions(
      {
        status: "perguntas",
        analise: "Duas pessoas num barco",
        perguntas: [{ pergunta: "Quem são?", opcoes: ["Casal", "Amigos", "", "Família", "Colegas", "Outro"] }],
      },
      { destination: "stories", frames: 1 },
    );
    expect(q.status).toBe("questions");
    expect(q.questions[0].options).toEqual(["Casal", "Amigos", "Família", "Colegas"]);
    expect(() => normalizeSuggestions({ status: "perguntas", perguntas: [] }, FEED)).toThrow();
    expect(() => normalizeSuggestions("texto solto", FEED)).toThrow();
    expect(() => normalizeSuggestions({ status: "sugestoes", versoes: [] }, { destination: "stories", frames: 1 })).toThrow(
      /sem os textos/,
    );
  });

  it("perguntas sem conteúdo com legendas viram sugestões", () => {
    const s = normalizeSuggestions({ status: "perguntas", perguntas: [], legendas: [{ texto: "Oi", hashtags: [] }] }, FEED);
    expect(s.status).toBe("suggestions");
    expect(s.captions[0].style).toBe("Opção");
  });

  it("normaliza os ajustes", () => {
    expect(normalizeRefine({ texto: "Curta — e boa\n#a #b", hashtags: ["#c"] })).toEqual({
      text: "Curta – e boa",
      hashtags: ["#c", "#a", "#b"],
    });
    expect(() => normalizeRefine({ texto: "" })).toThrow();
    expect(
      normalizeStoryRefine({ telas: [{ texto: "Curto", figurinha: { tipo: "quiz", texto: "Qual?", opcoes: ["A", "B"] } }] }, 2),
    ).toEqual([
      { text: "Curto", sticker: { kind: "quiz", text: "Qual?", options: ["A", "B"] } },
      { text: "", sticker: null },
    ]);
    expect(() => normalizeStoryRefine({ telas: [] }, 1)).toThrow();
  });

  it("formata a data da foto", () => {
    expect(formatTakenAt("2026-03-12T08:05:00")).toBe("12/03/2026, 08h05");
  });
});
