// Teste de ponta a ponta do Post Pronto, com as respostas do Claude simuladas.
// Uso: npm run test:e2e-post  (gera screenshots/post-pronto/ e falha se algo der errado)
// Cobre stories e feed, a página publicada (API com chave própria), o celular e o artefato do claude.ai.
import { chromium } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const OUT = "screenshots/post-pronto";
mkdirSync(`${OUT}/downloads`, { recursive: true });

if (!existsSync("dist-artifact/post-pronto.html")) execFileSync("node", ["scripts/build-post-pronto-artifact.mjs"], { stdio: "inherit" });

const PORT = 4500 + Math.floor(Math.random() * 300);
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe", detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && resolve());
  server.on("exit", () => reject(new Error("preview saiu")));
  setTimeout(() => reject(new Error("preview não subiu")), 20000);
});
const URL = `http://localhost:${PORT}/post-pronto/`;

// ===== Respostas simuladas do Claude =====
const MUSIC = [
  { titulo: "Aquarela", artista: "Toquinho", trecho: "refrão", por_que: "Clássico infantil brasileiro, afetivo." },
  { titulo: "Happy", artista: "Pharrell Williams", trecho: "refrão", por_que: "Alegre e conhecida." },
];
const PLACES = [
  { nome: "Campinas, São Paulo", tipo: "bairro ou cidade", por_que: "Informado no contexto e no GPS da foto." },
  { nome: "Casa da Vó", tipo: "ampla", por_que: "Criativa, combina com o texto." },
];
const NONE = { tipo: "nenhuma", texto: "", opcoes: [] };
const QUESTIONS = {
  status: "perguntas",
  analise: "Uma menina sopra as velas de um bolo com dinossauros, cercada de balões verdes.",
  perguntas: [{ pergunta: "Como a aniversariante se chama e quantos anos fez?", opcoes: ["Ana, 5 anos", "Prefiro não citar o nome"] }],
  legendas: [],
  versoes: [],
  hashtags: [],
  texto_imagem: [],
  texto_alternativo: "",
  musicas: [],
  localizacoes: [],
  dicas: [],
};
const STORY_SUGGESTIONS = {
  status: "sugestoes",
  analise: "Festa de 5 anos com tema de dinossauros na casa da avó.",
  perguntas: [],
  versoes: [
    {
      estilo: "Narrativa",
      telas: [
        { texto: "Cinco velinhas — e um dinossauro de chantilly", figurinha: NONE },
        { texto: "Qual tema você escolheria?", figurinha: { tipo: "enquete", texto: "Melhor tema de festa?", opcoes: ["Dinossauro", "Princesa"] } },
      ],
      por_que: "Conta a festa e termina com uma enquete fácil de votar.",
    },
    {
      estilo: "Direta",
      telas: [
        { texto: "5 anos de Ana", figurinha: NONE },
        { texto: "Obrigada, família!", figurinha: { tipo: "caixa de perguntas", texto: "Deixe um recado para a Ana", opcoes: [] } },
      ],
      por_que: "Curta e afetiva, convida a mandar recados.",
    },
    {
      estilo: "Interativa",
      telas: [
        { texto: "Adivinha quantos anos?", figurinha: { tipo: "quiz", texto: "Quantos anos a Ana fez?", opcoes: ["5", "4", "6"] } },
        { texto: "Festa na casa da vó", figurinha: { tipo: "slider", texto: "Quanto você ama festa de criança?", opcoes: ["🎂"] } },
      ],
      por_que: "Quiz e slider geram toques e respostas.",
    },
  ],
  hashtags: ["#festadinossauro", "#5anos"],
  musicas: MUSIC,
  localizacoes: PLACES,
  dicas: ["Poste a sequência de uma vez.", "Responda às mensagens da caixa de perguntas."],
};
const STORY_REFINE = {
  telas: [
    { texto: "Cinco velinhas!", figurinha: NONE },
    { texto: "Qual tema?", figurinha: { tipo: "enquete", texto: "Melhor tema de festa?", opcoes: ["Dinossauro", "Princesa"] } },
  ],
};
const SUGGESTIONS = {
  status: "sugestoes",
  analise: "Festa de 5 anos com tema de dinossauros na casa da avó.",
  perguntas: [],
  legendas: [
    {
      estilo: "Pequena história",
      texto:
        "Cinco velinhas e um dinossauro de chantilly 🦖\n\nA Ana escolheu cada detalhe desta festa — e fez questão de apagar as velas duas vezes.\n\nQual foi o tema do seu aniversário de criança? Conta aqui 👇",
      hashtags: ["#aniversarioinfantil", "#festadinossauro", "#5anos"],
      por_que: "Conta uma história curta e termina com uma pergunta fácil de responder.",
    },
    {
      estilo: "Curta e marcante",
      texto: "5 anos de pura energia.\n\nObrigada a todo mundo que veio celebrar com a gente!",
      hashtags: ["#aniversario", "#familia"],
      por_que: "Direta, boa para quem rola o feed rápido.",
    },
    {
      estilo: "Puxa conversa",
      texto: "Tem coisa melhor que festa na casa da vó?\n\nA Ana fez 5 anos rodeada de dinossauros, primos e muito bolo.\n\nMarque aqui quem também ama festa em família!",
      hashtags: ["#casadavo", "#festaemfamilia", "#dinossauros"],
      por_que: "Convida a marcar amigos, o que aumenta o alcance.",
    },
  ],
  texto_imagem: ["5 anos de Ana", "Rawr!", "Festa dos dinossauros"],
  texto_alternativo: "Menina de vestido amarelo sopra as velas de um bolo decorado com dinossauros, cercada de balões verdes.",
  musicas: MUSIC,
  localizacoes: PLACES,
  dicas: ["Use a foto das velas como capa.", "Responda aos comentários na primeira hora."],
};
const REFINE = {
  texto: "Cinco velinhas e um dinossauro de chantilly 🦖\n\nQual foi o tema do seu aniversário de criança?",
  hashtags: ["#aniversarioinfantil", "#festadinossauro"],
};
const pick = (p) =>
  p.includes("Reescreva os textos dos stories")
    ? STORY_REFINE
    : p.includes("Reescreva a legenda")
      ? REFINE
      : p.includes("Antes de escrever")
        ? QUESTIONS
        : p.includes("TEXTOS DOS STORIES")
          ? STORY_SUGGESTIONS
          : SUGGESTIONS;

/** Resposta da API em streaming (server-sent events), como a Anthropic envia. */
function sse(text) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev("message_start", {
    message: { id: "msg_teste", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } },
  });
  out += ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < text.length; i += 180) {
    out += ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: text.slice(i, i + 180) } });
  }
  out += ev("content_block_stop", { index: 0 });
  out += ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 900 } });
  out += ev("message_stop", {});
  return out;
}

/** Simula a API da Anthropic no contexto; devolve a lista de pedidos recebidos. */
async function mockApi(ctx) {
  const calls = [];
  await ctx.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    const prompt = body.messages[0].content.find((c) => c.type === "text").text;
    calls.push({ headers: req.headers(), body, prompt });
    await route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: sse(JSON.stringify(pick(prompt))) });
  });
  return calls;
}

// ===== Busca de trechos de música (iTunes) simulada =====
const HAPPY_RESULTS = [
  { trackName: "Happy", artistName: "Outro Artista", previewUrl: "https://audio.teste/errada.wav" },
  {
    trackName: 'Happy (From "Despicable Me 2")',
    artistName: "Pharrell Williams",
    previewUrl: "https://audio.teste/happy.wav",
    artworkUrl100: "https://audio.teste/capa.svg",
    trackViewUrl: "https://music.apple.com/br/album/happy/1",
  },
];
/** Silêncio em WAV (8 kHz, 8 bits, mono). */
function silentWav(seconds) {
  const n = 8000 * seconds;
  const b = Buffer.alloc(44 + n, 128);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  return b;
}
const WAV = silentWav(10);
const COVER = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f4c542"/></svg>';

/** Simula a busca do iTunes (com ou sem CORS; sem, a página cai no JSONP) e os arquivos do trecho. */
async function mockItunes(ctx, { cors = true } = {}) {
  const log = { searches: [], files: [] };
  await ctx.route("https://itunes.apple.com/search**", (route) => {
    const params = Object.fromEntries(new globalThis.URL(route.request().url()).searchParams);
    log.searches.push(params);
    const results = params.term.startsWith("Happy") ? HAPPY_RESULTS : [];
    const body = JSON.stringify({ resultCount: results.length, results });
    if (params.callback) return route.fulfill({ status: 200, contentType: "text/javascript", body: `\n\n\n${params.callback}(${body});` });
    // sem o cabeçalho, o Playwright liberaria o CORS sozinho; outra origem faz o navegador recusar a leitura
    const allow = cors ? "*" : "https://music.apple.com";
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": allow }, body });
  });
  await ctx.route("https://audio.teste/**", (route) => {
    const url = route.request().url();
    log.files.push(url);
    return url.endsWith(".svg")
      ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: COVER })
      : route.fulfill({ status: 200, contentType: "audio/wav", body: WAV });
  });
  return log;
}

// ===== Fotos de teste =====
/** Bloco EXIF (big-endian, como o do iPhone) com data e GPS. */
function exifSegment({ date, lat, lon }) {
  const t = Buffer.alloc(178);
  t.write("MM", 0, "latin1");
  t.writeUInt16BE(42, 2);
  t.writeUInt32BE(8, 4);
  const entry = (at, tag, type, count, value) => {
    t.writeUInt16BE(tag, at);
    t.writeUInt16BE(type, at + 2);
    t.writeUInt32BE(count, at + 4);
    t.writeUInt32BE(value, at + 8);
  };
  t.writeUInt16BE(2, 8);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 76);
  t.writeUInt16BE(1, 38);
  entry(40, 0x9003, 2, 20, 56);
  t.write(date, 56, "latin1");
  t.writeUInt16BE(4, 76);
  entry(78, 1, 2, 2, 0);
  t.write(lat < 0 ? "S" : "N", 86, "latin1");
  entry(90, 2, 5, 3, 130);
  entry(102, 3, 2, 2, 0);
  t.write(lon < 0 ? "W" : "E", 110, "latin1");
  entry(114, 4, 5, 3, 154);
  const dms = (at, v) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60 * 100);
    [[d, 1], [m, 1], [s, 100]].forEach(([n, den], i) => {
      t.writeUInt32BE(n, at + i * 8);
      t.writeUInt32BE(den, at + i * 8 + 4);
    });
  };
  dms(130, lat);
  dms(154, lon);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(t.length + 8, 2);
  return Buffer.concat([head, Buffer.from("Exif\0\0", "latin1"), t]);
}

function withExif(jpeg, meta) {
  const at = jpeg[3] === 0xe0 ? 4 + jpeg.readUInt16BE(4) : 2; // depois do bloco JFIF
  return Buffer.concat([jpeg.subarray(0, at), exifSegment(meta), jpeg.subarray(at)]);
}

/** Desenha uma "foto" no navegador e devolve o JPEG. */
async function drawPhoto(page, w, h, palette) {
  const b64 = await page.evaluate(
    ({ w, h, palette }) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, palette[0]);
      g.addColorStop(1, palette[1]);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = palette[2];
      for (let i = 0; i < 9; i++) {
        x.beginPath();
        x.arc(w * (0.1 + i * 0.1), h * (0.25 + (i % 3) * 0.08), w * 0.04, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = "#f3e2c7";
      x.fillRect(w * 0.3, h * 0.6, w * 0.4, h * 0.22);
      x.fillStyle = "#7a4b2a";
      x.fillRect(w * 0.3, h * 0.72, w * 0.4, h * 0.1);
      x.fillStyle = "#fff";
      for (let i = 0; i < 5; i++) x.fillRect(w * (0.36 + i * 0.07), h * 0.52, w * 0.012, h * 0.08);
      return c.toDataURL("image/jpeg", 0.85).split(",")[1];
    },
    { w, h, palette },
  );
  return Buffer.from(b64, "base64");
}

// ===== Utilitários =====
// CHROMIUM_PATH: usar um Chromium já instalado em vez do baixado pelo Playwright
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const fail = (msg) => {
  throw new Error(msg);
};
const expect = (cond, msg) => cond || fail(msg);
const shot = async (page, name, fullPage = false) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
};
/** Junta os erros da página; `expected` deixa passar os que o teste provoca de propósito. */
function watch(page, expected) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || (expected && (expected.test(m.text()) || expected.test(m.location()?.url ?? "")))) return;
    errors.push(`console: ${m.text()}`);
  });
}
async function hermetic(ctx) {
  // fontes do Google viram CSS vazio (o teste não depende de internet)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
}
async function noHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw <= iw, `${label}: a página rola na horizontal (${sw} > ${iw})`);
}
function python(code, ...args) {
  return execFileSync("python3", ["-I", "-c", code, ...args], { encoding: "utf8" }).trim();
}
const ZIP_SIZES =
  "import sys,zipfile,io\nfrom PIL import Image\nz=zipfile.ZipFile(sys.argv[1])\n" +
  "print(';'.join(n+'='+'x'.join(map(str,Image.open(io.BytesIO(z.read(n))).size)) for n in z.namelist() if n.endswith('.jpg')))";
async function download(page, button, path) {
  const [d] = await Promise.all([page.waitForEvent("download"), button.click()]);
  await d.saveAs(path);
  return d.suggestedFilename();
}

const CONTEXT = "Aniversário de 5 anos da Ana, na casa da avó em Campinas. A festa teve tema de dinossauros.";
let current = null; // página em teste, para a captura de tela quando algo falha

try {
  // ============ 1. Stories na página publicada (GitHub Pages), usando a API com chave própria ============
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", reducedMotion: "reduce", acceptDownloads: true });
  await hermetic(ctx);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` });
  const apiCalls = await mockApi(ctx);
  const itunes = await mockItunes(ctx);

  const page = (current = await ctx.newPage());
  watch(page);
  await page.goto(URL);
  await page.getByRole("heading", { name: "Post Pronto" }).waitFor();
  await page.getByText("Exemplo", { exact: true }).waitFor();
  expect((await page.getByRole("radio", { name: "Stories" }).getAttribute("aria-checked")) === "true", "stories deveria ser o padrão");
  await page.locator(".sticker-ghost", { hasText: "Pôr do sol ou nascer do sol?" }).waitFor();
  expect(await page.getByRole("button", { name: "Sugerir textos" }).isDisabled(), "botão deveria esperar as fotos");
  await shot(page, "01-inicio-stories");

  // fotos: a primeira com data e GPS de Campinas
  const photoA = withExif(await drawPhoto(page, 3024, 4032, ["#f7d9a8", "#e98d6b", "#5aa469"]), {
    date: "2026:03:12 15:20:41",
    lat: -22.9056,
    lon: -47.0608,
  });
  const photoB = await drawPhoto(page, 4000, 3000, ["#a8d8f7", "#6b8be9", "#e9c46a"]);
  // pelo botão, como uma pessoa faria; a 2ª foto vem sem tipo nem extensão, como em alguns celulares
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Escolher fotos", { exact: true }).click()]);
  await chooser.setFiles([
    { name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA },
    { name: "IMG_20261024_101010", mimeType: "", buffer: photoB },
    { name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("lembrete") },
  ]);
  await page.locator(".film .frame:not(.add)").nth(1).waitFor();
  await page.locator(".upload-error", { hasText: "1 arquivo não era imagem e ficou de fora." }).waitFor();
  expect((await page.locator(".cover-mark").count()) === 0, "nos stories não há capa");
  await page.getByText("Usar a data e o local gravados nas fotos").waitFor();
  await page.getByLabel("O que está acontecendo").fill(CONTEXT);
  await page.getByLabel("Sobre o perfil").fill("Perfil pessoal, para amigos e família");
  await page.getByLabel("Seu @, para a prévia").fill("@Familia.Souza");
  expect((await page.getByLabel("Seu @, para a prévia").inputValue()) === "familia.souza", "o @ deveria ser limpo");
  await shot(page, "02-stories-fotos-e-contexto");

  // sem chave, o botão abre a configuração
  await page.getByRole("button", { name: "Sugerir textos" }).click();
  await page.getByRole("dialog", { name: "Acesso ao Claude" }).waitFor();
  await page.getByLabel("Chave da API").fill("sk-ant-teste-123");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Chave salva neste navegador.").waitFor();

  // 1º pedido: o Claude pergunta
  await page.getByRole("button", { name: "Sugerir textos" }).click();
  await page.getByRole("heading", { name: "Só mais um pouco de contexto" }).waitFor();
  const first = apiCalls[0];
  expect(first.headers["x-api-key"] === "sk-ant-teste-123", "a chave deveria ir no x-api-key");
  expect(first.headers["anthropic-dangerous-direct-browser-access"] === "true", "faltou o cabeçalho de acesso pelo navegador");
  expect((first.headers["anthropic-beta"] || "").includes("server-side-fallback-2026-07-01"), "faltou o beta de fallback");
  expect(first.body.model === "claude-opus-5-5" && first.body.fallbacks === "default", "modelo ou fallback errado");
  expect(first.body.output_config?.format?.type === "json_schema" && first.body.output_config.effort === "medium", "faltou o formato JSON");
  expect(first.body.output_config.format.schema.required.includes("versoes"), "o formato deveria ser o dos stories");
  expect(first.body.stream === true, "deveria usar streaming");
  expect(first.body.messages[0].content.filter((c) => c.type === "image").length === 2, "deveria enviar as 2 fotos");
  expect(first.prompt.includes(CONTEXT) && first.prompt.includes("TEXTOS DOS STORIES"), "pedido de stories sem o contexto");
  expect(first.prompt.includes("exatamente 2 telas"), "deveria pedir uma tela por foto");
  expect(first.prompt.includes("Foto 1: tirada em 12/03/2026, 15h20; coordenadas GPS -22.90560, -47.06080"), "o EXIF não foi");
  await shot(page, "03-perguntas");

  // responde e gera as versões
  await page.getByRole("button", { name: "Ana, 5 anos" }).click();
  await page.getByRole("button", { name: "Gerar textos" }).click();
  await page.getByRole("heading", { name: "Escolha os textos dos stories" }).waitFor();
  expect(apiCalls[1].prompt.includes("Resposta: Ana, 5 anos") && apiCalls[1].prompt.includes("Não faça perguntas."), "respostas");
  const versionsText = await page.locator(".options").innerText();
  expect(!versionsText.includes("—") && versionsText.includes("Cinco velinhas – e um dinossauro"), "o travessão deveria virar meia-risca");
  expect(versionsText.includes("Enquete: Melhor tema de festa? (Dinossauro / Princesa)"), "figurinha da versão");
  expect(versionsText.includes("Quiz: Quantos anos a Ana fez? (5 (certa) / 4 / 6)"), "quiz com a resposta certa");
  await shot(page, "04-stories-versoes", true);

  // gera de novo com uma informação nova, na própria tela de escolha
  await page.getByLabel("Acrescente ou corrija uma informação (opcional)").fill("A festa foi surpresa, organizada pela tia Rosa.");
  await page.getByRole("button", { name: "Gerar de novo" }).click();
  await page.waitForFunction(() => document.querySelector("#pp-update")?.value === "");
  const regen = apiCalls[2];
  expect(regen.prompt.includes("INFORMAÇÃO NOVA\n") && regen.prompt.includes("organizada pela tia Rosa"), "o pedido leva a informação nova");
  expect(regen.prompt.includes(CONTEXT) && regen.prompt.includes("Resposta: Ana, 5 anos"), "e mantém o contexto e as respostas");
  expect(regen.body.messages[0].content.filter((c) => c.type === "image").length === 2, "gerar de novo reenvia as fotos");
  await page.getByText("Ver e editar o contexto que o Claude recebeu").click();
  const sentContext = await page.getByLabel("Contexto que o Claude recebeu").inputValue();
  expect(sentContext === `${CONTEXT}\nA festa foi surpresa, organizada pela tia Rosa.`, `a informação nova entra no contexto: ${sentContext}`);

  // escolhe a 1ª: o editor abre dentro dela; vê o texto na prévia e a enquete tracejada na tela 2
  await page.getByRole("button", { name: "Usar e editar" }).first().click();
  const tela1 = page.getByLabel("Texto da tela 1");
  await tela1.waitFor();
  expect((await page.locator(".option.chosen .editor").count()) === 1, "o editor abre dentro da versão escolhida");
  expect((await tela1.inputValue()) === "Cinco velinhas – e um dinossauro de chantilly", "texto da tela 1");
  await page.getByRole("button", { name: "Próxima tela" }).click();
  await page.locator(".sticker-ghost", { hasText: "Melhor tema de festa?" }).waitFor();
  await page.getByRole("button", { name: "Tela anterior" }).click();

  // ajuste do Claude e desfazer
  await page.getByRole("button", { name: "Mais curtos" }).click();
  await page.waitForFunction(() => document.querySelector("#pp-frame-0")?.value === "Cinco velinhas!");
  expect(apiCalls[3].prompt.includes("Reescreva os textos dos stories") && apiCalls[3].prompt.includes('"tipo": "enquete"'), "ajuste");
  expect(apiCalls[3].body.messages[0].content.every((c) => c.type === "text"), "o ajuste não precisa reenviar fotos");
  await page.getByRole("button", { name: "Desfazer o último ajuste" }).click();
  expect((await tela1.inputValue()) === "Cinco velinhas – e um dinossauro de chantilly", "desfazer deveria voltar o texto");

  // figurinha à mão na tela 1 e hashtag
  await page.getByLabel("Figurinha (você adiciona no Instagram)").first().selectOption("question");
  await page.getByLabel("Texto da figurinha (Caixa de perguntas)").fill("Mande um recado para a Ana");
  await page.locator(".sticker-ghost", { hasText: "Mande um recado para a Ana" }).waitFor();
  await page.getByLabel("Adicionar hashtag").fill("vovó");
  await page.getByLabel("Adicionar hashtag").press("Enter");
  await page.locator(".tag", { hasText: "#vovó" }).waitFor();
  // texto editado à mão continua lá mesmo tocando de novo na versão escolhida
  await page.getByLabel("Texto da tela 2").fill("Qual tema você escolheria para a sua festa?");
  await page.getByRole("button", { name: "Escolhida" }).click();
  expect((await page.getByLabel("Texto da tela 2").inputValue()) === "Qual tema você escolheria para a sua festa?", "tocar na escolhida apagou a edição");
  await shot(page, "05-stories-ajustes", true);

  // etapa final
  await page.getByRole("button", { name: "Confirmar textos" }).click();
  await page.getByRole("heading", { name: "Pronto para os stories" }).waitFor();
  const stickersText = await page.locator(".picks.stickers").innerText();
  expect(stickersText.includes("Caixa de perguntas: Mande um recado para a Ana"), "figurinha da tela 1 na lista");
  expect(stickersText.includes("Enquete: Melhor tema de festa? (Dinossauro / Princesa)"), "figurinha da tela 2 na lista");
  expect(stickersText.includes("#festadinossauro #5anos #vovó"), "hashtags da figurinha");
  await page.getByRole("radio", { name: /Happy/ }).check();
  await page.locator(".story-music", { hasText: "Happy · Pharrell Williams" }).waitFor();

  // ouve o trecho da música sugerida, pausa e continua
  await page.getByRole("button", { name: "Ouvir trecho de Happy" }).click();
  await page.getByRole("button", { name: "Pausar o trecho de Happy" }).waitFor();
  await page.waitForFunction(() => Number(document.querySelector(".song-track progress")?.value) > 0.3, null, { timeout: 8000 });
  expect(itunes.searches[0].term === "Happy Pharrell Williams" && itunes.searches[0].country === "BR", "busca do trecho");
  expect(itunes.files.includes("https://audio.teste/happy.wav") && !itunes.files.some((f) => f.includes("errada")), "tocou o trecho do artista certo");
  const player = page.locator(".song-player");
  expect((await player.getByRole("link", { name: /Prévia da Apple Music/ }).getAttribute("href")) === "https://music.apple.com/br/album/happy/1", "link da prévia");
  await shot(page, "06a-stories-trecho-da-musica");
  await page.getByRole("button", { name: "Pausar o trecho de Happy" }).click();
  await page.getByRole("button", { name: "Continuar o trecho de Happy" }).waitFor();
  // música sem trecho na Apple: avisa e oferece o YouTube, e o trecho anterior sai de cena
  await page.getByRole("button", { name: "Ouvir trecho de Aquarela" }).click();
  const noPreview = page.locator(".song-note", { hasText: "Não achei um trecho desta música" });
  await noPreview.waitFor();
  expect((await noPreview.getByRole("link").getAttribute("href")).endsWith("search_query=Aquarela%20Toquinho"), "YouTube da música sem trecho");
  expect((await player.count()) === 0, "só um trecho por vez");
  await page.locator(".place-ghost", { hasText: "CAMPINAS, SÃO PAULO" }).waitFor();
  expect((await page.locator(".how").innerText()).includes("Na tela 2, toque no ícone de figurinhas e adicione Enquete"), "passo a passo");
  await page.getByRole("radio", { name: "Moderno" }).click();
  await page.getByText("Faixa atrás do texto").click();
  await shot(page, "06-stories-pronto");
  await shot(page, "06b-stories-pronto-pagina-inteira", true);

  // baixa as 2 telas com texto, depois sem texto, e confere que o texto foi escrito na foto
  const zipButton = page.getByRole("button", { name: "Baixar as 2 telas (.zip)" });
  expect((await download(page, zipButton, `${OUT}/downloads/stories.zip`)) === "stories.zip", "nome do zip dos stories");
  const sizes = python(ZIP_SIZES, `${OUT}/downloads/stories.zip`);
  expect(sizes === "story-1.jpg=1080x1920;story-2.jpg=1080x1920", `telas no zip: ${sizes}`);
  await page.getByText("Escrever os textos nas fotos").click();
  await page.getByText("Sem o texto na foto, escreva no story com o botão Aa.").waitFor();
  await download(page, page.getByRole("button", { name: "Baixar as 2 telas (.zip)" }), `${OUT}/downloads/stories-sem-texto.zip`);
  const diff = python(
    "import sys,zipfile,io\nfrom PIL import Image, ImageChops\n" +
      "a,b=[Image.open(io.BytesIO(zipfile.ZipFile(p).read('story-1.jpg'))).convert('L') for p in sys.argv[1:3]]\n" +
      "box=ImageChops.difference(a,b).point(lambda v: 255 if v>40 else 0).getbbox()\nprint(box)",
    `${OUT}/downloads/stories.zip`,
    `${OUT}/downloads/stories-sem-texto.zip`,
  );
  const box = diff === "None" ? null : diff.replace(/[()\s]/g, "").split(",").map(Number);
  expect(box && box[1] > 1920 * 0.1 && box[3] < 1920 * 0.5, `o texto deveria estar na parte de cima da tela 1: ${diff}`);
  await page.getByText("Escrever os textos nas fotos").click();

  await download(page, page.getByRole("button", { name: /Baixar textos, figurinhas, música e local/ }), `${OUT}/downloads/stories.txt`);
  const storiesTxt = readFileSync(`${OUT}/downloads/stories.txt`, "utf8");
  expect(storiesTxt.startsWith("STORIES\nTela 1: Cinco velinhas – e um dinossauro de chantilly\n  Figurinha – Caixa de perguntas: Mande um recado para a Ana"), `txt: ${storiesTxt}`);
  expect(storiesTxt.includes("MÚSICA\nHappy – Pharrell Williams (refrão)") && storiesTxt.includes("HASHTAGS\n#festadinossauro #5anos #vovó"), `txt: ${storiesTxt}`);
  await download(page, page.getByRole("button", { name: "Baixar tudo junto (.zip)" }), `${OUT}/downloads/stories-completo.zip`);
  const all = python("import sys,zipfile\nprint(','.join(zipfile.ZipFile(sys.argv[1]).namelist()))", `${OUT}/downloads/stories-completo.zip`);
  expect(all === "story-1.jpg,story-2.jpg,stories.txt", `zip completo: ${all}`);
  await noHorizontalScroll(page, "desktop, stories");

  // ============ 2. Feed, na mesma página ============
  await page.getByRole("button", { name: "Começar outro post" }).click();
  await page.getByRole("button", { name: "Apagar e começar outro" }).click();
  await page.getByRole("heading", { name: "Fotos e contexto" }).waitFor();
  await page.getByRole("radio", { name: "Feed" }).click();
  await page.locator('input[type="file"]').setInputFiles([
    { name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA },
    { name: "bolo.jpg", mimeType: "image/jpeg", buffer: photoB },
  ]);
  await page.locator(".film .frame:not(.add)").nth(1).waitFor();
  expect((await page.locator(".cover-mark").count()) === 1, "no feed, a primeira foto é a capa");
  await page.getByLabel("O que está acontecendo").fill(CONTEXT);
  await page.getByRole("button", { name: "Sugerir legendas" }).click();
  await page.getByRole("button", { name: "Ana, 5 anos" }).click();
  await page.getByRole("button", { name: "Gerar legendas" }).click();
  await page.getByRole("heading", { name: "Escolha a legenda" }).waitFor();
  const feedCall = apiCalls[apiCalls.length - 1];
  expect(feedCall.body.output_config.format.schema.required.includes("legendas") && feedCall.prompt.includes("LEGENDAS"), "pedido do feed");
  const optionsText = await page.locator(".options").innerText();
  expect(!optionsText.includes("—") && optionsText.includes("festa – e fez"), "o travessão deveria virar meia-risca");
  await shot(page, "07-feed-legendas", true);

  await page.getByRole("button", { name: "Usar e editar" }).first().click();
  const draft = page.getByLabel("Texto", { exact: true });
  await draft.waitFor();
  const original = await draft.inputValue();
  await page.getByRole("button", { name: "Mais curta" }).click();
  await page.waitForFunction(() => !document.querySelector("#pp-draft")?.value.includes("chantilly 🦖\n\nA Ana"));
  await page.getByRole("button", { name: "Desfazer o último ajuste" }).click();
  expect((await draft.inputValue()) === original, "desfazer deveria voltar a legenda");
  await page.getByLabel("Adicionar hashtag").fill("vovó lúcia");
  await page.getByLabel("Adicionar hashtag").press("Enter");
  await page.locator(".tag", { hasText: "#vovólúcia" }).waitFor();

  await page.getByRole("button", { name: "Confirmar legenda" }).click();
  await page.getByRole("heading", { name: "Pronto para postar" }).waitFor();
  await page.getByText("Foto 1, tirada em 12/03/2026, 15h20, tem localização gravada").waitFor();
  await page.getByText("Escrever um texto na capa").click();
  expect((await page.getByLabel("Texto", { exact: true }).inputValue()) === "5 anos de Ana", "deveria sugerir o texto da capa");
  await page.getByRole("radio", { name: "Impacto" }).click();
  const zoom = page.getByLabel("Zoom");
  await zoom.focus();
  for (let i = 0; i < 30; i++) await zoom.press("ArrowRight");
  const canvas = page.locator(".shot canvas");
  const cbox = await canvas.boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cbox.x + cbox.width / 2 - 80, cbox.y + cbox.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await shot(page, "08-feed-pronto");

  expect(
    (await download(page, page.getByRole("button", { name: "Baixar as 2 fotos (.zip)" }), `${OUT}/downloads/fotos.zip`)) ===
      "post-pronto-fotos.zip",
    "nome do zip das fotos",
  );
  const feedSizes = python(ZIP_SIZES, `${OUT}/downloads/fotos.zip`);
  expect(feedSizes === "post-pronto-1.jpg=1080x1350;post-pronto-2.jpg=1080x1350", `fotos no zip: ${feedSizes}`);
  await page.getByRole("button", { name: "Copiar legenda" }).click();
  await page.getByText("Legenda copiada.").waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith("Cinco velinhas") && clip.endsWith("#aniversarioinfantil #festadinossauro #5anos #vovólúcia"), `legenda copiada: ${clip}`);
  expect(!clip.includes("—"), "a legenda copiada não pode ter travessão");
  await download(page, page.getByRole("button", { name: /Baixar legenda, música e local/ }), `${OUT}/downloads/legenda.txt`);
  const txt = readFileSync(`${OUT}/downloads/legenda.txt`, "utf8");
  expect(txt.includes("LOCALIZAÇÃO\nCampinas, São Paulo") && txt.includes("TEXTO ALTERNATIVO\nMenina de vestido amarelo"), `txt: ${txt}`);
  await noHorizontalScroll(page, "desktop, feed");
  await ctx.close();

  // ============ 3. Celular, tema escuro (stories) ============
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: "pt-BR",
    reducedMotion: "reduce",
  });
  await hermetic(phone);
  await phone.addInitScript(() => localStorage.setItem("post-pronto:api-key", "sk-ant-teste-123"));
  const phoneCalls = await mockApi(phone);
  // busca sem CORS: a leitura direta falha (erro esperado no console) e a página usa o JSONP
  const phoneItunes = await mockItunes(phone, { cors: false });
  const m = (current = await phone.newPage());
  watch(m, /itunes\.apple\.com/);
  await m.goto(URL);
  await m.getByRole("heading", { name: "Post Pronto" }).waitFor();
  await shot(m, "10-celular-inicio");
  await noHorizontalScroll(m, "celular, início");
  await m.locator('input[type="file"]').setInputFiles([{ name: "video.mp4", mimeType: "video/mp4", buffer: Buffer.from("x") }]);
  await m.locator(".upload-error", { hasText: "O arquivo escolhido não é uma imagem" }).waitFor();
  await m.locator('input[type="file"]').setInputFiles([{ name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA }]);
  await m.locator(".film .frame:not(.add)").first().waitFor();
  expect((await m.locator(".upload-error").count()) === 0, "o aviso some quando a foto entra");
  // só a foto, sem contar nada: o texto complementar é opcional
  await m.getByText("Só as fotos são obrigatórias.").waitFor();
  expect((await m.getByLabel("O que está acontecendo (opcional)").inputValue()) === "", "o contexto começa vazio");
  await m.getByRole("button", { name: "Sugerir textos" }).click();
  await m.getByRole("button", { name: "Pular e gerar assim mesmo" }).click();
  await m.getByRole("heading", { name: "Escolha os textos dos stories" }).waitFor();
  expect(phoneCalls[0].prompt.includes("- O que está acontecendo: (não informado)"), "sem contexto, o pedido diz que não foi informado");
  expect((await m.locator(".option").first().locator(".story-frame").count()) === 1, "com 1 foto, cada versão tem 1 tela");
  await shot(m, "11-celular-versoes");
  await m.getByRole("button", { name: "Usar e editar" }).nth(2).click();
  await m.getByRole("button", { name: "Confirmar textos" }).click();
  await m.getByRole("heading", { name: "Pronto para os stories" }).waitFor();
  await shot(m, "12-celular-pronto");
  await m.getByRole("button", { name: "Ouvir trecho de Happy" }).click();
  await m.getByRole("button", { name: "Pausar o trecho de Happy" }).waitFor();
  expect(phoneItunes.searches.some((p) => p.callback?.startsWith("__postProntoItunes")), "sem CORS, a busca vai por JSONP");
  await m.locator(".song-player").scrollIntoViewIfNeeded();
  await shot(m, "13-celular-trecho-da-musica");
  await noHorizontalScroll(m, "celular, etapa final");
  await phone.close();

  // ============ 4. Artefato do claude.ai (conta de quem abre a página) ============
  const art = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
  await hermetic(art);
  const artifactHtml = readFileSync("dist-artifact/post-pronto.html", "utf8");
  const skeleton =
    '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    "<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>" +
    artifactHtml +
    "</body></html>";
  await art.route("https://artefato.teste/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: skeleton }));
  await art.addInitScript(
    ({ QUESTIONS, SUGGESTIONS, REFINE, STORY_SUGGESTIONS, STORY_REFINE }) => {
      const pick = (p) =>
        p.includes("Reescreva os textos dos stories")
          ? STORY_REFINE
          : p.includes("Reescreva a legenda")
            ? REFINE
            : p.includes("Antes de escrever")
              ? QUESTIONS
              : p.includes("TEXTOS DOS STORIES")
                ? STORY_SUGGESTIONS
                : SUGGESTIONS;
      const calls = (window.__calls = []);
      const saved = (window.__saved = []);
      const sample = async () => {
        throw { code: "invalid_request", message: "use sample.json" };
      };
      sample.json = async (input, opts = {}) => {
        const images = Array.from(opts.images || []);
        calls.push({ input, images: images.length, types: images.map((b) => b.type), tier: opts.modelTier, cache: opts.cache });
        await new Promise((r) => setTimeout(r, 250));
        const answer = pick(input);
        const text = JSON.stringify(answer);
        opts.onText?.({ text, delta: text });
        return answer;
      };
      sample.limits = async () => ({
        maxPromptBytes: 262144,
        images: { maxCount: 5, maxInputBytes: 20e6, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
      });
      const downloads = {
        save: async ({ filename, data }) => {
          saved.push({ filename, size: data.size, type: data.type });
          return { status: "saved" };
        },
      };
      window.claude = { use: async (name) => (name === "sample" ? sample : name === "downloads" ? downloads : null) };
    },
    { QUESTIONS, SUGGESTIONS, REFINE, STORY_SUGGESTIONS, STORY_REFINE },
  );
  const a = (current = await art.newPage());
  watch(a);
  await a.goto("https://artefato.teste/");
  await a.getByRole("heading", { name: "Post Pronto" }).waitFor();
  expect((await a.getByRole("button", { name: "Configurar" }).count()) === 0, "no artefato não há chave para configurar");
  expect((await a.evaluate(() => document.documentElement.lang)) === "pt-BR", "idioma da página");
  const [artChooser] = await Promise.all([a.waitForEvent("filechooser"), a.getByText("Escolher fotos", { exact: true }).click()]);
  await artChooser.setFiles([{ name: "1000012345", mimeType: "", buffer: photoA }]);
  await a.locator(".film .frame:not(.add)").first().waitFor();
  await a.getByLabel("O que está acontecendo").fill(CONTEXT);
  await a.getByRole("button", { name: "Sugerir textos" }).click();
  await a.getByRole("button", { name: "Pular e gerar assim mesmo" }).click();
  await a.getByRole("heading", { name: "Escolha os textos dos stories" }).waitFor();
  const calls = await a.evaluate(() => window.__calls);
  expect(calls.length === 2 && calls[0].images === 1 && calls[0].types[0] === "image/jpeg", "fotos para o Claude no artefato");
  expect(calls[0].tier === "default" && calls[1].input.includes("Não faça perguntas."), "pedido do artefato");
  await a.getByRole("button", { name: "Usar e editar" }).nth(1).click();
  // gerar de novo sem escrever nada: opções diferentes com o mesmo contexto
  await a.getByRole("button", { name: "Gerar de novo" }).click();
  await a.waitForFunction(() => window.__calls.length === 3);
  await a.getByRole("heading", { name: "Escolha os textos dos stories" }).waitFor();
  const more = (await a.evaluate(() => window.__calls))[2];
  expect(more.cache === false && more.input.includes("• Cinco velinhas"), "gerar outras opções deveria pedir respostas novas");
  // edita o contexto que o Claude recebeu e gera de novo
  await a.getByText("Ver e editar o contexto que o Claude recebeu").click();
  const contextBox = a.getByLabel("Contexto que o Claude recebeu");
  expect((await contextBox.inputValue()) === CONTEXT, "o contexto aparece para editar");
  await contextBox.fill(CONTEXT.replace("Campinas", "Valinhos"));
  await a.getByRole("button", { name: "Gerar de novo" }).click();
  await a.waitForFunction(() => window.__calls.length === 4);
  const edited = (await a.evaluate(() => window.__calls))[3];
  expect(edited.input.includes("na casa da avó em Valinhos") && !edited.input.includes("• Cinco velinhas"), "gerar de novo com o contexto editado");
  expect(edited.images === 1 && edited.cache === false && !edited.input.includes("INFORMAÇÃO NOVA"), "gerar de novo reenvia a foto");
  await a.getByRole("button", { name: "Usar e editar" }).nth(1).click();
  await a.getByRole("button", { name: "Confirmar textos" }).click();
  await a.getByRole("heading", { name: "Pronto para os stories" }).waitFor();
  await a.getByRole("button", { name: "Baixar a foto" }).click();
  await a.getByText("Download pronto.").waitFor();
  await a.getByRole("button", { name: /Baixar textos, figurinhas, música e local/ }).click();
  await a.waitForFunction(() => window.__saved.length === 2);
  const saved = await a.evaluate(() => window.__saved);
  expect(saved[0].filename === "story.jpg" && saved[0].size > 20000, `foto salva no artefato: ${JSON.stringify(saved[0])}`);
  expect(saved[1].filename === "stories.txt", "texto salvo no artefato");
  await shot(a, "20-artefato-stories-pronto");
  // dentro do Claude a página não toca áudio de outros sites: a música abre no YouTube
  const youtube = a.getByRole("link", { name: "Ouvir no YouTube: Happy" });
  expect((await youtube.getAttribute("href")) === "https://www.youtube.com/results?search_query=Happy%20Pharrell%20Williams", "YouTube no artefato");
  await a.getByText("Dentro do Claude, a página não consegue tocar áudio de outros sites").waitFor();
  expect((await a.getByRole("button", { name: /Ouvir trecho/ }).count()) === 0, "no artefato não há player");
  await a.locator('section[aria-labelledby="pp-music"]').screenshot({ path: `${OUT}/20b-artefato-musica.png` });
  expect((await a.locator(".open-browser").count()) === 0, "no computador, o aviso de abrir no navegador não aparece");
  await art.close();

  // ============ 5. Artefato aberto no app do Claude para Android ============
  const droid = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A.241005.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36",
  });
  await hermetic(droid);
  await droid.route("https://artefato.teste/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: skeleton }));
  await droid.addInitScript(() => {
    window.claude = { use: async () => null };
  });
  const d = (current = await droid.newPage());
  watch(d);
  await d.goto("https://artefato.teste/");
  const hintBox = d.locator(".open-browser.strong");
  await hintBox.waitFor();
  expect((await hintBox.innerText()).includes("https://claude.ai/artifact/"), "o aviso traz o link do artefato");
  await hintBox.getByRole("button", { name: "Copiar link" }).waitFor();
  await shot(d, "21-artefato-android-app");
  await droid.close();

  if (errors.length) fail(`Erros no console:\n${errors.join("\n")}`);
  console.log(`OK: stories e feed na página publicada, no celular e no artefato. Capturas em ${OUT}/`);
} catch (e) {
  await current?.screenshot({ path: `${OUT}/falha.png`, fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
