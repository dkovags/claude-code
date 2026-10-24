// Instruções enviadas ao Claude e leitura das respostas.
// O Claude recebe só o texto montado aqui (mais as fotos): cada chamada é independente.
import { MAX_HASHTAGS } from "./caption";
import type {
  Answer, Brief, CaptionOption, Destination, Draft, Goal, MusicPick, PhotoMeta, PlacePick, Question, Sticker,
  StickerKind, StoryFrame, StoryVersion, Suggestions, Tone,
} from "./types";

const GOAL_PROMPT: Record<Destination, Record<Goal, string>> = {
  feed: {
    comments: "puxar conversa e gerar comentários",
    shares: "ser salvo e compartilhado (algo útil, inspirador ou com que as pessoas se identifiquem)",
    sales: "divulgar um produto, serviço ou negócio e levar a uma ação (mandar mensagem, clicar no link da bio, visitar)",
    memory: "registrar um momento com afeto, para amigos e família",
  },
  stories: {
    comments: "gerar interação: respostas por mensagem e votos e respostas nas figurinhas",
    shares: "alcançar mais gente: ser compartilhado e repostado por quem aparece ou por quem assiste",
    sales: "divulgar um produto, serviço ou negócio e levar a uma ação (mandar mensagem, tocar no link)",
    memory: "registrar um momento com afeto, para amigos e família",
  },
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

function languagePrompt(b: Brief): string {
  switch (b.language) {
    case "en":
      return "inglês";
    case "es":
      return "espanhol";
    case "pt-en":
      return b.destination === "stories"
        ? "português do Brasil e inglês (a mesma frase nas duas línguas, uma embaixo da outra)"
        : "português do Brasil e, logo abaixo, a mesma legenda em inglês";
    default:
      return "português do Brasil";
  }
}

function emojiPrompt(b: Brief): string {
  if (b.emojis === "none") return "não use emojis";
  if (b.emojis === "many") return "use emojis à vontade, sem exagerar";
  return b.destination === "stories" ? "use poucos emojis (no máximo 1 por tela)" : "use poucos emojis (de 1 a 3 por legenda)";
}

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
    `- Objetivo: ${GOAL_PROMPT[b.destination][b.goal]}`,
    `- Tom: ${TONE_PROMPT[b.tone]}`,
    `- Idioma dos textos: ${languagePrompt(b)}`,
    `- Emojis: ${emojiPrompt(b)}`,
  ];
}

/** Figurinhas interativas dos stories, com o nome usado com o Claude. */
export const STICKER_TYPES: Record<StickerKind, string> = {
  poll: "enquete",
  question: "caixa de perguntas",
  quiz: "quiz",
  slider: "slider",
  countdown: "contagem regressiva",
  link: "link",
  "add-yours": "adicione o seu",
};
const STICKER_KINDS = Object.fromEntries(Object.entries(STICKER_TYPES).map(([k, v]) => [v, k as StickerKind]));
const NO_STICKER = { tipo: "nenhuma", texto: "", opcoes: [] as string[] };

const FEED_EXAMPLE = {
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

const STORIES_EXAMPLE = {
  status: "sugestoes",
  analise: "O que as fotos mostram e o ângulo escolhido, em 1 ou 2 frases.",
  perguntas: [],
  versoes: [
    {
      estilo: "Narrativa",
      telas: [
        { texto: "Frase curta sobre a foto 1", figurinha: NO_STICKER },
        { texto: "Frase curta sobre a foto 2", figurinha: { tipo: "enquete", texto: "Pergunta da enquete?", opcoes: ["Opção 1", "Opção 2"] } },
      ],
      por_que: "Por que tende a engajar, em uma frase.",
    },
  ],
  hashtags: ["#assunto"],
  musicas: [{ titulo: "Título exato", artista: "Artista", trecho: "refrão", por_que: "Por que combina." }],
  localizacoes: [{ nome: "Nome do lugar", tipo: "local exato", por_que: "De onde veio a pista." }],
  dicas: ["Dica prática para estes stories."],
};

export interface SuggestRequest {
  brief: Brief;
  /** Quantas fotos o post tem (nos stories, uma tela por foto). */
  photoCount: number;
  /** Quantas foram anexadas à chamada (pode haver limite de imagens por chamada). */
  attachedCount: number;
  /** Dados gravados em cada foto, na ordem (vazio quando a pessoa não quer usar). */
  metas: PhotoMeta[];
  /** Respostas às perguntas da rodada anterior. */
  answers: Answer[];
  /** false depois que a pessoa já respondeu (ou pulou) as perguntas. */
  allowQuestions: boolean;
  /** Sugestões já feitas (uma linha cada), para pedir opções diferentes. */
  avoid: string[];
  /** Informação que a pessoa acrescentou ou corrigiu depois de ver as sugestões. */
  update?: string;
  /** Data de hoje, como em todayLabel(). */
  today: string;
}

const MUSIC_RULES =
  "provavelmente estejam na biblioteca de músicas do Instagram. Misture opções brasileiras e internacionais quando " +
  'fizer sentido. Para cada uma, informe o título exato, o artista, o trecho a usar em "trecho" (por exemplo, ' +
  '"refrão" ou "início") e, em "por_que", por que combina. Não invente músicas e não diga que alguma está em alta.';

const PLACE_RULES =
  "da mais específica à mais ampla, com o nome do jeito que se busca no Instagram: o local exato (quando der para " +
  "saber pelo contexto, pelas coordenadas GPS ou por algo inconfundível nas fotos), o bairro ou a cidade, e uma opção " +
  'mais ampla ou criativa. Em "tipo", use "local exato", "bairro ou cidade" ou "ampla". Não invente estabelecimentos; ' +
  'se não houver pista do lugar, diga isso em "por_que" e sugira opções coerentes com o contexto.';

function feedBody(L: string[], r: SuggestRequest) {
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
  avoidLines(L, r.avoid, "opções");
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
    `Em "musicas", sugira 5 músicas reais e conhecidas que combinem com o clima das fotos e da legenda e que ${MUSIC_RULES}`,
    "",
    "LOCALIZAÇÃO",
    `Em "localizacoes", sugira 3 opções para marcar no post, ${PLACE_RULES}`,
    "",
    "DICAS",
    'Em "dicas", dê de 2 a 3 dicas práticas e específicas para este post render mais (por exemplo: qual foto usar como ' +
      "capa, o que responder nos comentários, que tipo de story fazer para divulgar o post).",
    "",
    "FORMATO DA RESPOSTA",
    "Responda só com um objeto JSON, sem texto antes ou depois, neste formato:",
    JSON.stringify(FEED_EXAMPLE, null, 2),
    '"analise" resume em 1 ou 2 frases o que as fotos mostram e o ângulo que você escolheu. Com status "perguntas", as ' +
      'listas "legendas", "texto_imagem", "musicas", "localizacoes" e "dicas" ficam vazias e "texto_alternativo" fica "".',
  );
}

function storiesBody(L: string[], r: SuggestRequest) {
  const n = r.photoCount;
  const screens = n === 1 ? "exatamente 1 tela" : `exatamente ${n} telas, uma para cada foto, na mesma ordem`;
  const types = Object.values(STICKER_TYPES)
    .map((t) => `"${t}"`)
    .join(", ");
  L.push(
    "",
    "TEXTOS DOS STORIES",
    "Nos stories não há legenda: o texto vai escrito sobre a foto, que ocupa a tela inteira (9:16), e quem assiste fica " +
      "uns 5 segundos em cada tela. Escreva 3 versões com abordagens diferentes entre si (por exemplo: narrativa, direta " +
      `e marcante, interativa) e dê a cada uma um nome curto em "estilo". Cada versão tem ${screens}, em "telas". Em cada tela:`,
    '- "texto": o que vai escrito sobre a foto. Curto, para ler num relance: de 3 a 8 palavras, no máximo 12. ' +
      (n > 1
        ? "A primeira tela prende a atenção e a última chama para a ação (responder, votar, mandar mensagem, tocar no link)."
        : "Prenda a atenção e, se fizer sentido, chame para a ação (responder, votar, mandar mensagem, tocar no link)."),
    `- "figurinha": a figurinha interativa que combina com a tela, ou tipo "nenhuma". Tipos: ${types}. Enquete: ` +
      'pergunta em "texto" e de 2 a 4 opções curtas em "opcoes". Caixa de perguntas: o convite para as pessoas mandarem ' +
      "perguntas ou respostas. Quiz: pergunta e de 2 a 4 opções, a primeira é a correta. Slider: pergunta e um emoji em " +
      '"opcoes". Contagem regressiva: o nome do evento. Link: o texto do botão (o endereço a pessoa coloca no Instagram). ' +
      "Adicione o seu: o convite para outras pessoas postarem algo parecido. Use figurinhas onde fizerem sentido, sem pôr " +
      'em todas as telas: são elas que mais geram respostas nos stories. Com "nenhuma", deixe "texto" vazio e "opcoes" como [].',
    "- Fale do que aparece de fato na foto e do contexto informado; evite clichês e frases que serviriam para qualquer foto.",
    "- Não coloque hashtags nem menções no texto.",
    `- ${NO_EM_DASH}`,
    "- Não identifique ninguém pelo rosto; use só nomes que estejam no contexto.",
    "- Não invente fatos (nomes, datas, lugares, preços) que não estejam no contexto nem visíveis nas fotos.",
  );
  avoidLines(L, r.avoid, "versões");
  L.push(
    'Em "por_que", explique em uma frase por que a versão tende a engajar.',
    "",
    "HASHTAGS",
    'Em "hashtags", sugira de 1 a 3 hashtags específicas para a figurinha de hashtag, que é opcional nos stories.',
    "",
    "MÚSICAS",
    'Em "musicas", sugira 5 músicas reais e conhecidas para a figurinha de música, que combinem com o clima das fotos e ' +
      `dos textos e que ${MUSIC_RULES} Nos stories toca um trecho de uns 15 segundos.`,
    "",
    "LOCALIZAÇÃO",
    `Em "localizacoes", sugira 3 opções para a figurinha de localização, ${PLACE_RULES}`,
    "",
    "DICAS",
    'Em "dicas", dê de 2 a 3 dicas práticas e específicas para estes stories renderem mais (por exemplo: onde posicionar ' +
      "as figurinhas, marcar quem aparece com a figurinha de menção, responder às mensagens, guardar nos destaques).",
    "",
    "FORMATO DA RESPOSTA",
    "Responda só com um objeto JSON, sem texto antes ou depois, neste formato (o exemplo tem 2 telas; use o número de " +
      "telas pedido acima):",
    JSON.stringify(STORIES_EXAMPLE, null, 2),
    '"analise" resume em 1 ou 2 frases o que as fotos mostram e o ângulo que você escolheu. Com status "perguntas", as ' +
      'listas "versoes", "hashtags", "musicas", "localizacoes" e "dicas" ficam vazias.',
  );
}

function avoidLines(L: string[], avoid: string[], what: string) {
  const items = avoid.map((t) => t.trim()).filter(Boolean);
  if (!items.length) return;
  L.push(`- Escreva ${what} novas, diferentes destas, já sugeridas antes:`);
  for (const t of items) L.push(`  • ${t.split("\n")[0].slice(0, 160)}`);
}

export function buildSuggestPrompt(r: SuggestRequest): string {
  const stories = r.brief.destination === "stories";
  const photos =
    r.photoCount === 1
      ? "1 foto"
      : stories
        ? `${r.photoCount} fotos, na ordem em que vão aparecer`
        : `${r.photoCount} fotos, na ordem do carrossel (a primeira é a capa)`;
  const attached =
    r.attachedCount < r.photoCount
      ? ` Só as ${r.attachedCount} primeiras estão anexadas; as demais seguem o mesmo tema.`
      : "";
  const task = stories
    ? `Prepare stories do Instagram, uma tela para cada foto, a partir das fotos anexadas (${photos}) e do contexto abaixo.`
    : `Prepare uma publicação para o feed do Instagram a partir das fotos anexadas (${photos}) e do contexto abaixo.`;
  const L: string[] = [
    stories
      ? "Você é estrategista de conteúdo para Instagram, especialista em stories que geram respostas e engajamento."
      : "Você é estrategista de conteúdo e redator(a) de legendas para Instagram, especialista em engajamento orgânico.",
    "",
    "TAREFA",
    task + attached,
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
  if (r.update?.trim()) {
    L.push(
      "",
      "INFORMAÇÃO NOVA",
      "A pessoa viu as sugestões anteriores e acrescentou ou corrigiu isto. Leve em conta com prioridade sobre o resto do " +
        "contexto e escreva sugestões novas a partir disso:",
      r.update.trim(),
    );
  }

  L.push("", "PERGUNTAS");
  if (r.allowQuestions) {
    L.push(
      "Antes de escrever, veja se falta alguma informação essencial que não dá para deduzir das fotos nem do contexto " +
        "e que mudaria muito o texto, como: qual é a ocasião; quem são as pessoas e qual a relação com elas; o que está " +
        "sendo divulgado, o preço ou como comprar. Se faltar, responda com status \"perguntas\": de 1 a 3 perguntas curtas " +
        "e diretas, cada uma com 2 a 4 respostas prováveis em \"opcoes\" (curtas, para tocar e escolher), e deixe as listas " +
        "de sugestões vazias. Se der para escrever bons textos com o que já existe, não pergunte nada: responda com " +
        "status \"sugestoes\".",
    );
  } else {
    L.push(
      "Não faça perguntas. Responda com status \"sugestoes\" usando o que houver; quando faltar algum dado, escreva de um " +
        "jeito que funcione sem ele.",
    );
  }

  if (stories) storiesBody(L, r);
  else feedBody(L, r);
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

/** As telas no formato combinado com o Claude. */
function framesForPrompt(frames: StoryFrame[]) {
  return frames.map((f) => ({
    texto: f.text,
    figurinha: f.sticker ? { tipo: STICKER_TYPES[f.sticker.kind], texto: f.sticker.text, opcoes: f.sticker.options } : NO_STICKER,
  }));
}

export interface StoryRefineRequest {
  brief: Brief;
  analysis: string;
  frames: StoryFrame[];
  instruction: string;
}

export function buildStoryRefinePrompt(r: StoryRefineRequest): string {
  const n = r.frames.length;
  return [
    "Você é especialista em stories do Instagram. Reescreva os textos dos stories abaixo atendendo ao pedido da pessoa e " +
      "mantendo o que já funciona.",
    "",
    "SOBRE OS STORIES",
    `- O que as fotos mostram: ${r.analysis.trim() || "(sem descrição)"}`,
    ...contextLines(r.brief),
    "",
    "TELAS ATUAIS",
    JSON.stringify({ telas: framesForPrompt(r.frames) }, null, 2),
    "",
    "PEDIDO",
    r.instruction.trim(),
    "",
    "REGRAS",
    `- Devolva exatamente ${n} ${n === 1 ? "tela" : "telas"}, na mesma ordem.`,
    "- Textos curtos, para ler num relance: de 3 a 8 palavras, no máximo 12.",
    "- Mantenha as figurinhas, a menos que o pedido seja para mudá-las. Tipos: " +
      `${Object.values(STICKER_TYPES).join(", ")} ou "nenhuma" (com "texto" vazio e "opcoes" como []).`,
    "- Não coloque hashtags nem menções no texto.",
    `- ${NO_EM_DASH}`,
    "- Não invente fatos que não estejam no contexto.",
    "",
    "FORMATO DA RESPOSTA",
    "Responda só com um objeto JSON, sem texto antes ou depois, no mesmo formato das telas atuais:",
    '{"telas": [{"texto": "...", "figurinha": {"tipo": "nenhuma", "texto": "", "opcoes": []}}]}',
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

/** Ajustes de um toque nos textos dos stories. */
export const STORY_REFINE_PRESETS: { label: string; instruction: string }[] = [
  { label: "Mais curtos", instruction: "Deixe os textos de todas as telas mais curtos, com no máximo 6 palavras cada." },
  { label: "Mais divertidos", instruction: "Deixe os textos mais leves e divertidos, com humor." },
  { label: "Mais emotivos", instruction: "Deixe os textos mais emotivos e pessoais." },
  { label: "Mais diretos para vender", instruction: "Deixe os textos mais diretos, com foco em levar à compra ou ao contato." },
  { label: "Com emojis", instruction: "Acrescente um emoji que combine em cada texto." },
  { label: "Sem emojis", instruction: "Remova todos os emojis dos textos." },
  {
    label: "Mais figurinhas",
    instruction: "Inclua figurinhas interativas (enquete, caixa de perguntas ou quiz) onde fizer sentido, para gerar mais respostas.",
  },
  { label: "Sem figurinhas", instruction: "Remova todas as figurinhas e mantenha só os textos." },
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
const statusSchema = { type: "string", enum: ["perguntas", "sugestoes"] };
const questionsSchema = { type: "array", items: objectOf(["pergunta", "opcoes"]) };
const musicSchema = { type: "array", items: objectOf(["titulo", "artista", "trecho", "por_que"]) };
const placesSchema = { type: "array", items: objectOf(["nome", "tipo", "por_que"]) };
const frameSchema = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "figurinha"],
  properties: {
    texto: str,
    figurinha: {
      type: "object",
      additionalProperties: false,
      required: ["tipo", "texto", "opcoes"],
      properties: { tipo: { type: "string", enum: [...Object.values(STICKER_TYPES), "nenhuma"] }, texto: str, opcoes: strList },
    },
  },
};

export const FEED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(FEED_EXAMPLE),
  properties: {
    status: statusSchema,
    analise: str,
    perguntas: questionsSchema,
    legendas: { type: "array", items: objectOf(["estilo", "texto", "hashtags", "por_que"]) },
    texto_imagem: strList,
    texto_alternativo: str,
    musicas: musicSchema,
    localizacoes: placesSchema,
    dicas: strList,
  },
};

export const STORIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(STORIES_EXAMPLE),
  properties: {
    status: statusSchema,
    analise: str,
    perguntas: questionsSchema,
    versoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["estilo", "telas", "por_que"],
        properties: { estilo: str, telas: { type: "array", items: frameSchema }, por_que: str },
      },
    },
    hashtags: strList,
    musicas: musicSchema,
    localizacoes: placesSchema,
    dicas: strList,
  },
};

export const suggestSchema = (d: Destination) => (d === "stories" ? STORIES_SCHEMA : FEED_SCHEMA);

export const REFINE_SCHEMA = objectOf(["texto", "hashtags"]);

export const STORY_REFINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["telas"],
  properties: { telas: { type: "array", items: frameSchema } },
};

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
export function cleanHashtags(list: unknown[], max = MAX_HASHTAGS): string[] {
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
  return out.slice(0, max);
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

function stickerOf(v: unknown): Sticker | null {
  const o = asObj(v);
  const kind = STICKER_KINDS[text(o.tipo).toLocaleLowerCase("pt-BR")];
  if (!kind) return null;
  const label = unquote(text(o.texto)) || (kind === "link" ? "Saiba mais" : "");
  if (!label) return null;
  const options = asList(o.opcoes).map(text).filter(Boolean);
  if (kind === "poll" || kind === "quiz") {
    return options.length >= 2 ? { kind, text: label, options: options.slice(0, 4) } : null;
  }
  if (kind === "slider") return { kind, text: label, options: [options[0] || "😍"] };
  return { kind, text: label, options: [] };
}

function frameOf(v: unknown): StoryFrame {
  const o = asObj(v);
  return { text: unquote(splitTrailingHashtags(text(o.texto)).text), sticker: stickerOf(o.figurinha) };
}

/** Exatamente uma tela por foto: completa com telas vazias ou corta as que sobram. */
function fitFrames(list: unknown[], count: number): StoryFrame[] {
  const frames = list.map(frameOf);
  return Array.from({ length: Math.max(1, count) }, (_, i) => frames[i] ?? { text: "", sticker: null });
}

function versionOf(v: unknown, count: number): StoryVersion | null {
  const o = asObj(v);
  const frames = fitFrames(asList(o.telas), count);
  if (!frames.some((f) => f.text)) return null;
  return { style: text(o.estilo) || "Versão", frames, why: text(o.por_que) };
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

export function normalizeSuggestions(raw: unknown, opts: { destination: Destination; frames: number }): Suggestions {
  const o = asObj(raw);
  const stories = opts.destination === "stories";
  const questions = asList(o.perguntas).map(questionOf).filter(present).slice(0, 3);
  const captions = stories ? [] : asList(o.legendas).map(captionOf).filter(present).slice(0, 5);
  const versions = stories ? asList(o.versoes).map((v) => versionOf(v, opts.frames)).filter(present).slice(0, 5) : [];
  const options = captions.length + versions.length;
  const askedQuestions = text(o.status) === "perguntas" || options === 0;
  if (askedQuestions && questions.length === 0 && options === 0) {
    throw new BadAnswerError(`A resposta veio sem ${stories ? "os textos" : "legendas"}. Tente de novo.`);
  }
  return {
    status: askedQuestions && questions.length ? "questions" : "suggestions",
    analysis: text(o.analise),
    questions,
    captions,
    stories: versions,
    hashtags: stories ? cleanHashtags(asList(o.hashtags), 3) : [],
    overlays: stories ? [] : asList(o.texto_imagem).map(text).map(unquote).filter(Boolean).slice(0, 5),
    altText: stories ? "" : text(o.texto_alternativo),
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

export function normalizeStoryRefine(raw: unknown, count: number): StoryFrame[] {
  const frames = fitFrames(asList(asObj(raw).telas), count);
  if (!frames.some((f) => f.text)) throw new BadAnswerError("A resposta veio sem os textos. Tente de novo.");
  return frames;
}
