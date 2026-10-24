// Instruções enviadas ao Claude e leitura das respostas.
// O Claude recebe só o texto montado aqui (mais as fotos): cada chamada é independente.
import { MAX_HASHTAGS } from "./caption";
import type {
  Answer, Brief, CaptionOption, Draft, EmojiLevel, Goal, Language, MusicPick, PhotoMeta, PlacePick, Question,
  Suggestions, Tone,
} from "./types";

const GOAL_PROMPT: Record<Goal, string> = {
  comments: "puxar conversa e gerar comentários",
  shares: "ser salvo e compartilhado (algo útil, inspirador ou com que as pessoas se identifiquem)",
  sales: "divulgar um produto, serviço ou negócio e levar a uma ação (mandar mensagem, clicar no link da bio, visitar)",
  memory: "registrar um momento com afeto, para amigos e família",
};

const TONE_PROMPT: Record<Tone, string> = {
  auto: "escolha o tom que combinar com as fotos, o contexto e o perfil",
  fun: "leve e divertido",
  inspiring: "inspirador",
  emotional: "emotivo",
  elegant: "elegante e sofisticado",
  professional: "profissional, claro e confiável",
  bold: "irreverente e ousado, sem ser ofensivo",
};

const LANGUAGE_PROMPT: Record<Language, string> = {
  pt: "português do Brasil",
  en: "inglês",
  es: "espanhol",
  "pt-en": "português do Brasil e, logo abaixo, a mesma legenda em inglês",
};

const EMOJI_PROMPT: Record<EmojiLevel, string> = {
  none: "não use emojis",
  few: "use poucos emojis (de 1 a 3 por legenda)",
  many: "use emojis à vontade, sem exagerar",
};

const NO_EM_DASH = "Nunca use travessão (—). Se precisar de um traço, use meia-risca (–).";

/** "2026-03-12T18:40:00" → "12/03/2026, 18h40". */
export function formatTakenAt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}, ${m[4]}h${m[5]}` : iso;
}

/** Data de hoje no formato 24/10/2026, para o Claude saber se a foto é antiga. */
export function todayLabel(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function metaLines(metas: PhotoMeta[]): string[] {
  return metas.flatMap((m, i) => {
    const parts: string[] = [];
    if (m.takenAt) parts.push(`tirada em ${formatTakenAt(m.takenAt)}`);
    if (m.lat !== undefined && m.lon !== undefined) {
      parts.push(`coordenadas GPS ${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`);
    }
    return parts.length ? [`  - Foto ${i + 1}: ${parts.join("; ")}`] : [];
  });
}

function contextLines(b: Brief): string[] {
  return [
    `- O que está acontecendo: ${b.context.trim() || "(não informado)"}`,
    `- Sobre o perfil: ${b.profile.trim() || "(não informado)"}`,
    `- Objetivo do post: ${GOAL_PROMPT[b.goal]}`,
    `- Tom: ${TONE_PROMPT[b.tone]}`,
    `- Idioma da legenda: ${LANGUAGE_PROMPT[b.language]}`,
    `- Emojis: ${EMOJI_PROMPT[b.emojis]}`,
  ];
}

const SUGGEST_EXAMPLE = {
  status: "sugestoes",
  analise: "O que as fotos mostram e o ângulo escolhido, em 1 ou 2 frases.",
  perguntas: [],
  legendas: [
    {
      estilo: "Pequena história",
      texto: "Gancho na primeira linha\n\nCorpo da legenda.\n\nChamada para ação.",
      hashtags: ["#assunto", "#lugar", "#nicho"],
      por_que: "Por que tende a engajar, em uma frase.",
    },
  ],
  texto_imagem: ["Frase curta para a capa"],
  texto_alternativo: "Descrição objetiva da capa.",
  musicas: [{ titulo: "Título exato", artista: "Artista", trecho: "refrão", por_que: "Por que combina." }],
  localizacoes: [{ nome: "Nome do lugar", tipo: "local exato", por_que: "De onde veio a pista." }],
  dicas: ["Dica prática para este post."],
};

export interface SuggestRequest {
  brief: Brief;
  /** Quantas fotos o post tem. */
  photoCount: number;
  /** Quantas foram anexadas à chamada (pode haver limite de imagens por chamada). */
  attachedCount: number;
  /** Dados gravados em cada foto, na ordem do carrossel (vazio quando a pessoa não quer usar). */
  metas: PhotoMeta[];
  /** Respostas às perguntas da rodada anterior. */
  answers: Answer[];
  /** false depois que a pessoa já respondeu (ou pulou) as perguntas. */
  allowQuestions: boolean;
  /** Legendas já sugeridas, para pedir opções diferentes. */
  avoid: string[];
  /** Data de hoje, como em todayLabel(). */
  today: string;
}

export function buildSuggestPrompt(r: SuggestRequest): string {
  const photos =
    r.photoCount === 1 ? "1 foto" : `${r.photoCount} fotos, na ordem do carrossel (a primeira é a capa)`;
  const attached =
    r.attachedCount < r.photoCount
      ? ` Só as ${r.attachedCount} primeiras estão anexadas; as demais seguem o mesmo tema.`
      : "";
  const L: string[] = [
    "Você é estrategista de conteúdo e redator(a) de legendas para Instagram, especialista em engajamento orgânico.",
    "",
    "TAREFA",
    `Prepare uma publicação para o feed do Instagram a partir das fotos anexadas (${photos}) e do contexto abaixo.${attached}`,
    "",
    "CONTEXTO",
    ...contextLines(r.brief),
    `- Data de hoje: ${r.today}`,
  ];
  const meta = metaLines(r.metas);
  if (meta.length) L.push("- Dados gravados nas fotos:", ...meta);
  if (r.answers.length) {
    L.push("", "RESPOSTAS DA PESSOA ÀS SUAS PERGUNTAS");
    for (const a of r.answers) L.push(`- Pergunta: ${a.question}`, `  Resposta: ${a.answer}`);
  }

  L.push("", "PERGUNTAS");
  if (r.allowQuestions) {
    L.push(
      "Antes de escrever, veja se falta alguma informação essencial que não dá para deduzir das fotos nem do contexto " +
        "e que mudaria muito a legenda, como: qual é a ocasião; quem são as pessoas e qual a relação com elas; o que está " +
        "sendo divulgado, o preço ou como comprar. Se faltar, responda com status \"perguntas\": de 1 a 3 perguntas curtas " +
        "e diretas, cada uma com 2 a 4 respostas prováveis em \"opcoes\" (curtas, para tocar e escolher), e deixe as listas " +
        "de sugestões vazias. Se der para escrever boas legendas com o que já existe, não pergunte nada: responda com " +
        "status \"sugestoes\".",
    );
  } else {
    L.push(
      "Não faça perguntas. Responda com status \"sugestoes\" usando o que houver; quando faltar algum dado, escreva de um " +
        "jeito que funcione sem ele.",
    );
  }

  L.push(
    "",
    "LEGENDAS",
    "Escreva 3 opções com abordagens diferentes entre si (por exemplo: uma pequena história, uma curta e marcante, uma " +
      "que puxe conversa com uma pergunta) e dê a cada uma um nome curto em \"estilo\". Em todas:",
    "- A primeira linha é o gancho: precisa prender a atenção sozinha e ter no máximo 125 caracteres, que é o que " +
      "aparece no feed antes do \"mais\".",
    "- Fale do que aparece de fato nas fotos e do contexto informado; evite clichês e frases que serviriam para qualquer foto.",
    "- Use quebras de linha para facilitar a leitura e termine com uma chamada para ação coerente com o objetivo " +
      "(comentar, salvar, compartilhar, marcar alguém, mandar mensagem, link na bio).",
    "- No máximo 2.200 caracteres, o limite do Instagram; prefira legendas enxutas.",
    `- Não coloque hashtags no texto. Elas vão em "hashtags": de 3 a ${MAX_HASHTAGS} por opção (o Instagram aceita no ` +
      `máximo ${MAX_HASHTAGS}), específicas do assunto, sem genéricas como #instagood, #love ou #reels.`,
    `- ${NO_EM_DASH}`,
    "- Não identifique ninguém pelo rosto; use só nomes que estejam no contexto.",
    "- Não invente fatos (nomes, datas, lugares, preços) que não estejam no contexto nem visíveis nas fotos.",
  );
  const avoid = r.avoid.map((t) => t.trim()).filter(Boolean);
  if (avoid.length) {
    L.push("- Escreva opções novas, diferentes destas, já sugeridas antes:");
    for (const t of avoid) L.push(`  • ${t.split("\n")[0].slice(0, 160)}`);
  }
  L.push(
    'Em "por_que", explique em uma frase por que a opção tende a engajar.',
    "",
    "TEXTO NA FOTO",
    'Em "texto_imagem", sugira 3 frases bem curtas (até 6 palavras) para escrever sobre a capa, caso a pessoa queira.',
    "",
    "TEXTO ALTERNATIVO",
    'Em "texto_alternativo", descreva a capa de forma objetiva para quem usa leitor de tela, em até 2 frases, no idioma da legenda.',
    "",
    "MÚSICAS",
    'Em "musicas", sugira 5 músicas reais e conhecidas que combinem com o clima das fotos e da legenda e que ' +
      "provavelmente estejam na biblioteca de músicas do Instagram. Misture opções brasileiras e internacionais quando " +
      'fizer sentido. Para cada uma, informe o título exato, o artista, o trecho a usar em "trecho" (por exemplo, ' +
      '"refrão" ou "início") e, em "por_que", por que combina. Não invente músicas e não diga que alguma está em alta.',
    "",
    "LOCALIZAÇÃO",
    'Em "localizacoes", sugira 3 opções para marcar no post, da mais específica à mais ampla, com o nome do jeito que se ' +
      "busca no Instagram: o local exato (quando der para saber pelo contexto, pelas coordenadas GPS ou por algo " +
      'inconfundível nas fotos), o bairro ou a cidade, e uma opção mais ampla ou criativa. Em "tipo", use "local exato", ' +
      '"bairro ou cidade" ou "ampla". Não invente estabelecimentos; se não houver pista do lugar, diga isso em "por_que" ' +
      "e sugira opções coerentes com o contexto.",
    "",
    "DICAS",
    'Em "dicas", dê de 2 a 3 dicas práticas e específicas para este post render mais (por exemplo: qual foto usar como ' +
      "capa, o que responder nos comentários, que tipo de story fazer para divulgar o post).",
    "",
    "FORMATO DA RESPOSTA",
    "Responda só com um objeto JSON, sem texto antes ou depois, neste formato:",
    JSON.stringify(SUGGEST_EXAMPLE, null, 2),
    '"analise" resume em 1 ou 2 frases o que as fotos mostram e o ângulo que você escolheu. Com status "perguntas", as ' +
      'listas "legendas", "texto_imagem", "musicas", "localizacoes" e "dicas" ficam vazias e "texto_alternativo" fica "".',
  );
  return L.join("\n");
}

export interface RefineRequest {
  brief: Brief;
  analysis: string;
  draft: Draft;
  instruction: string;
}

export function buildRefinePrompt(r: RefineRequest): string {
  return [
    "Você é redator(a) de legendas para Instagram. Reescreva a legenda abaixo atendendo ao pedido da pessoa e mantendo o que já funciona.",
    "",
    "SOBRE O POST",
    `- O que as fotos mostram: ${r.analysis.trim() || "(sem descrição)"}`,
    ...contextLines(r.brief),
    "",
    "LEGENDA ATUAL",
    r.draft.text.trim() || "(vazia)",
    "",
    "HASHTAGS ATUAIS",
    r.draft.hashtags.join(" ") || "(nenhuma)",
    "",
    "PEDIDO",
    r.instruction.trim(),
    "",
    "REGRAS",
    "- A primeira linha é o gancho, com no máximo 125 caracteres.",
    "- No máximo 2.200 caracteres.",
    `- Hashtags fora do texto, em "hashtags": de 3 a ${MAX_HASHTAGS} (o Instagram aceita no máximo ${MAX_HASHTAGS}). ` +
      "Mantenha as atuais, a menos que o pedido seja para mudá-las.",
    `- ${NO_EM_DASH}`,
    "- Não invente fatos que não estejam no contexto.",
    "",
    "FORMATO DA RESPOSTA",
    "Responda só com um objeto JSON, sem texto antes ou depois:",
    '{"texto": "a legenda reescrita, com \\n nas quebras de linha", "hashtags": ["#exemplo"]}',
  ].join("\n");
}

/** Ajustes de um toque na legenda escolhida. */
export const REFINE_PRESETS: { label: string; instruction: string }[] = [
  { label: "Mais curta", instruction: "Deixe a legenda bem mais curta, com no máximo 3 linhas." },
  { label: "Mais longa", instruction: "Desenvolva mais a legenda, contando um pouco mais da história." },
  { label: "Mais emotiva", instruction: "Deixe a legenda mais emotiva e pessoal." },
  { label: "Mais divertida", instruction: "Deixe a legenda mais leve e divertida, com humor." },
  { label: "Mais profissional", instruction: "Deixe a legenda mais profissional e objetiva." },
  { label: "Sem emojis", instruction: "Remova todos os emojis." },
  { label: "Terminar com pergunta", instruction: "Termine a legenda com uma pergunta que incentive comentários." },
  { label: "Trocar hashtags", instruction: "Mantenha o texto e troque as hashtags por outras mais específicas." },
];

// Formatos de resposta (JSON Schema) para a API, que garante a estrutura.
const str = { type: "string" };
const strList = { type: "array", items: str };
function objectOf(fields: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(fields.map((f) => [f, f === "hashtags" || f === "opcoes" ? strList : str])),
  };
}

export const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(SUGGEST_EXAMPLE),
  properties: {
    status: { type: "string", enum: ["perguntas", "sugestoes"] },
    analise: str,
    perguntas: { type: "array", items: objectOf(["pergunta", "opcoes"]) },
    legendas: { type: "array", items: objectOf(["estilo", "texto", "hashtags", "por_que"]) },
    texto_imagem: strList,
    texto_alternativo: str,
    musicas: { type: "array", items: objectOf(["titulo", "artista", "trecho", "por_que"]) },
    localizacoes: { type: "array", items: objectOf(["nome", "tipo", "por_que"]) },
    dicas: strList,
  },
};

export const REFINE_SCHEMA = objectOf(["texto", "hashtags"]);

// Leitura tolerante das respostas

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Troca travessões por meia-risca (preferência de escrita). */
export function fixDashes(s: string): string {
  return s.replace(/[—―]/g, "–");
}

const text = (v: unknown): string => (typeof v === "string" ? fixDashes(v).trim() : "");
const unquote = (s: string) => s.replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();

/**
 * Limpa as hashtags: uma por item, com "#", sem espaços nem pontuação, sem repetir, no máximo 5.
 * "#praia de copacabana" vira "#praiadecopacabana"; "#a #b" num item só vira duas.
 */
export function cleanHashtags(list: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string") continue;
    const pieces = (item.match(/#/g) || []).length > 1 ? item.split("#") : [item];
    for (const piece of pieces) {
      const tag = piece.replace(/[^\p{L}\p{N}_]/gu, "");
      if (!tag || /^\d+$/.test(tag)) continue;
      const key = tag.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`#${tag}`);
    }
  }
  return out.slice(0, MAX_HASHTAGS);
}

/** Se a legenda terminar com uma linha só de hashtags, tira do texto e devolve separado. */
export function splitTrailingHashtags(caption: string): { text: string; hashtags: string[] } {
  const lines = caption.trimEnd().split("\n");
  const tags: string[] = [];
  while (lines.length && /^(\s*#[\p{L}\p{N}_]+[\s,]*)+$/u.test(lines[lines.length - 1])) {
    tags.unshift(...(lines.pop()!.match(/#[\p{L}\p{N}_]+/gu) || []));
  }
  return { text: lines.join("\n").trim(), hashtags: tags };
}

function captionOf(v: unknown): CaptionOption | null {
  const o = asObj(v);
  const split = splitTrailingHashtags(text(o.texto));
  if (!split.text) return null;
  return {
    style: text(o.estilo) || "Opção",
    text: split.text,
    hashtags: cleanHashtags([...asList(o.hashtags), ...split.hashtags]),
    why: text(o.por_que),
  };
}

function questionOf(v: unknown): Question | null {
  const o = asObj(v);
  const question = text(o.pergunta);
  if (!question) return null;
  const options = asList(o.opcoes).map(text).filter(Boolean).slice(0, 4);
  return { question, options };
}

function musicOf(v: unknown): MusicPick | null {
  const o = asObj(v);
  const title = unquote(text(o.titulo));
  if (!title) return null;
  return { title, artist: text(o.artista), part: text(o.trecho), why: text(o.por_que) };
}

function placeOf(v: unknown): PlacePick | null {
  const o = asObj(v);
  const name = text(o.nome);
  if (!name) return null;
  return { name, kind: text(o.tipo), why: text(o.por_que) };
}

const present = <T>(x: T | null): x is T => x !== null;

/** Erro de resposta incompleta ou fora do formato combinado. */
export class BadAnswerError extends Error {}

export function normalizeSuggestions(raw: unknown): Suggestions {
  const o = asObj(raw);
  const questions = asList(o.perguntas).map(questionOf).filter(present).slice(0, 3);
  const captions = asList(o.legendas).map(captionOf).filter(present).slice(0, 5);
  const askedQuestions = text(o.status) === "perguntas" || captions.length === 0;
  if (askedQuestions && questions.length === 0 && captions.length === 0) {
    throw new BadAnswerError("A resposta veio sem legendas. Tente de novo.");
  }
  return {
    status: askedQuestions && questions.length ? "questions" : "suggestions",
    analysis: text(o.analise),
    questions,
    captions,
    overlays: asList(o.texto_imagem).map(text).map(unquote).filter(Boolean).slice(0, 5),
    altText: text(o.texto_alternativo),
    music: asList(o.musicas).map(musicOf).filter(present).slice(0, 6),
    places: asList(o.localizacoes).map(placeOf).filter(present).slice(0, 4),
    tips: asList(o.dicas).map(text).filter(Boolean).slice(0, 4),
  };
}

export function normalizeRefine(raw: unknown): Draft {
  const o = asObj(raw);
  const split = splitTrailingHashtags(text(o.texto));
  if (!split.text) throw new BadAnswerError("A resposta veio sem a legenda. Tente de novo.");
  return { text: split.text, hashtags: cleanHashtags([...asList(o.hashtags), ...split.hashtags]) };
}
