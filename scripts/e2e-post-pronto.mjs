// Teste de ponta a ponta do Post Pronto, com as respostas do Claude simuladas.
// Uso: npm run test:e2e-post  (gera screenshots/post-pronto/ e falha se algo der errado)
// Cobre as duas formas de uso: a página publicada (API com chave própria) e o artefato do claude.ai.
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
const QUESTIONS = {
  status: "perguntas",
  analise: "Uma menina sopra as velas de um bolo com dinossauros, cercada de balões verdes.",
  perguntas: [{ pergunta: "Como a aniversariante se chama e quantos anos fez?", opcoes: ["Ana, 5 anos", "Prefiro não citar o nome"] }],
  legendas: [],
  texto_imagem: [],
  texto_alternativo: "",
  musicas: [],
  localizacoes: [],
  dicas: [],
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
  musicas: [
    { titulo: "Aquarela", artista: "Toquinho", trecho: "refrão", por_que: "Clássico infantil brasileiro, afetivo." },
    { titulo: "Happy", artista: "Pharrell Williams", trecho: "refrão", por_que: "Alegre e conhecida." },
  ],
  localizacoes: [
    { nome: "Campinas, São Paulo", tipo: "bairro ou cidade", por_que: "Informado no contexto e no GPS da foto." },
    { nome: "Casa da Vó", tipo: "ampla", por_que: "Criativa, combina com a legenda." },
  ],
  dicas: ["Use a foto das velas como capa.", "Responda aos comentários na primeira hora."],
};
const REFINE = {
  texto: "Cinco velinhas e um dinossauro de chantilly 🦖\n\nQual foi o tema do seu aniversário de criança?",
  hashtags: ["#aniversarioinfantil", "#festadinossauro"],
};
const pick = (prompt) =>
  prompt.includes("Reescreva a legenda") ? REFINE : prompt.includes("Antes de escrever") ? QUESTIONS : SUGGESTIONS;

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
function watch(page) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
}
async function hermetic(ctx) {
  // fontes do Google viram CSS vazio (o teste não depende de internet)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
}
async function noHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw <= iw, `${label}: a página rola na horizontal (${sw} > ${iw})`);
}
function pythonCheck(code, ...args) {
  return execFileSync("python3", ["-I", "-c", code, ...args], { encoding: "utf8" }).trim();
}

const CONTEXT = "Aniversário de 5 anos da Ana, na casa da avó em Campinas. A festa teve tema de dinossauros.";

try {
  // ============ 1. Página publicada (GitHub Pages), usando a API com chave própria ============
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "pt-BR", reducedMotion: "reduce", acceptDownloads: true });
  await hermetic(ctx);
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` });
  const apiCalls = [];
  await ctx.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    apiCalls.push({ headers: req.headers(), body });
    const prompt = body.messages[0].content.find((c) => c.type === "text").text;
    await route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: sse(JSON.stringify(pick(prompt))) });
  });

  const page = await ctx.newPage();
  watch(page);
  await page.goto(URL);
  await page.getByRole("heading", { name: "Post Pronto" }).waitFor();
  await page.getByText("Exemplo", { exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Sugerir legendas" }).isDisabled(), "botão deveria esperar as fotos");
  await shot(page, "01-inicio-exemplo");

  // fotos: a primeira com data e GPS de Campinas
  const photoA = withExif(await drawPhoto(page, 3024, 4032, ["#f7d9a8", "#e98d6b", "#5aa469"]), {
    date: "2026:03:12 15:20:41",
    lat: -22.9056,
    lon: -47.0608,
  });
  const photoB = await drawPhoto(page, 4000, 3000, ["#a8d8f7", "#6b8be9", "#e9c46a"]);
  await page.locator('input[type="file"]').setInputFiles([
    { name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA },
    { name: "bolo.jpg", mimeType: "image/jpeg", buffer: photoB },
  ]);
  await page.locator(".film .frame:not(.add)").nth(1).waitFor();
  await page.getByText("Usar a data e o local gravados nas fotos").waitFor();
  await page.getByLabel("O que está acontecendo").fill(CONTEXT);
  await page.getByLabel("Sobre o perfil").fill("Perfil pessoal, para amigos e família");
  await page.getByLabel("Seu @, para a prévia").fill("@Familia.Souza");
  expect((await page.getByLabel("Seu @, para a prévia").inputValue()) === "familia.souza", "o @ deveria ser limpo");
  await shot(page, "02-fotos-e-contexto");

  // sem chave, o botão abre a configuração
  await page.getByRole("button", { name: "Sugerir legendas" }).click();
  await page.getByRole("dialog", { name: "Acesso ao Claude" }).waitFor();
  await shot(page, "03-chave-da-api");
  await page.getByLabel("Chave da API").fill("sk-ant-teste-123");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Chave salva neste navegador.").waitFor();

  // 1º pedido: o Claude pergunta
  await page.getByRole("button", { name: "Sugerir legendas" }).click();
  await page.getByRole("heading", { name: "Só mais um pouco de contexto" }).waitFor();
  const first = apiCalls[0];
  expect(first.headers["x-api-key"] === "sk-ant-teste-123", "a chave deveria ir no x-api-key");
  expect(first.headers["anthropic-dangerous-direct-browser-access"] === "true", "faltou o cabeçalho de acesso pelo navegador");
  expect((first.headers["anthropic-beta"] || "").includes("server-side-fallback-2026-07-01"), "faltou o beta de fallback");
  expect(first.body.model === "claude-opus-5-5" && first.body.fallbacks === "default", "modelo ou fallback errado");
  expect(first.body.output_config?.format?.type === "json_schema" && first.body.output_config.effort === "medium", "faltou o formato JSON");
  expect(first.body.stream === true, "deveria usar streaming");
  const content = first.body.messages[0].content;
  expect(content.filter((c) => c.type === "image").length === 2, "deveria enviar as 2 fotos");
  const prompt1 = content.find((c) => c.type === "text").text;
  expect(prompt1.includes(CONTEXT), "o contexto não foi para o Claude");
  expect(prompt1.includes("Foto 1: tirada em 12/03/2026, 15h20; coordenadas GPS -22.90560, -47.06080"), "o EXIF não foi para o Claude");
  expect(prompt1.includes("Antes de escrever"), "a primeira rodada deveria permitir perguntas");
  await shot(page, "04-perguntas");

  // responde e gera
  await page.getByRole("button", { name: "Ana, 5 anos" }).click();
  await page.getByRole("button", { name: "Gerar legendas" }).click();
  await page.getByRole("heading", { name: "Escolha a legenda" }).waitFor();
  const prompt2 = apiCalls[1].body.messages[0].content.find((c) => c.type === "text").text;
  expect(prompt2.includes("Resposta: Ana, 5 anos") && prompt2.includes("Não faça perguntas."), "as respostas não foram");
  const optionsText = await page.locator(".options").innerText();
  expect(!optionsText.includes("—") && optionsText.includes("festa – e fez"), "o travessão deveria virar meia-risca");
  await shot(page, "05-legendas", true);

  // escolhe, pede ajuste, desfaz, acrescenta hashtag
  await page.getByRole("button", { name: "Usar esta" }).first().click();
  const draft = page.getByLabel("Texto", { exact: true });
  await draft.waitFor();
  const original = await draft.inputValue();
  await page.getByRole("button", { name: "Mais curta" }).click();
  await page.waitForFunction(() => document.querySelector("#pp-draft")?.value.startsWith("Cinco velinhas") && !document.querySelector("#pp-draft").value.includes("chantilly 🦖\n\nA Ana"));
  expect(apiCalls[2].body.messages[0].content.every((c) => c.type === "text"), "o ajuste não precisa reenviar fotos");
  await page.getByRole("button", { name: "Desfazer o último ajuste" }).click();
  expect((await draft.inputValue()) === original, "desfazer deveria voltar a legenda");
  const tagInput = page.getByLabel("Adicionar hashtag");
  await tagInput.fill("vovó lúcia");
  await tagInput.press("Enter");
  await page.locator(".tag", { hasText: "#vovólúcia" }).waitFor();
  await shot(page, "06-ajustes", true);

  // confirma e chega à etapa final
  await page.getByRole("button", { name: "Confirmar legenda" }).click();
  await page.getByRole("heading", { name: "Pronto para postar" }).waitFor();
  await page.getByText("Foto 1, tirada em 12/03/2026, 15h20, tem localização gravada").waitFor();
  await page.getByRole("radio", { name: /Happy/ }).check();
  await page.locator(".feed-sub", { hasText: "Pharrell Williams · Happy" }).waitFor();
  await page.locator(".feed-sub", { hasText: "Campinas, São Paulo" }).waitFor();

  // texto na capa, estilo, posição, zoom e enquadramento arrastando
  await page.getByText("Escrever um texto na capa").click();
  expect((await page.getByLabel("Texto", { exact: true }).inputValue()) === "5 anos de Ana", "deveria sugerir o texto da capa");
  await page.getByRole("radio", { name: "Impacto" }).click();
  await page.getByRole("radio", { name: "Em cima" }).click();
  await page.getByText("Faixa atrás do texto").click();
  const zoom = page.getByLabel("Zoom");
  await zoom.focus();
  for (let i = 0; i < 30; i++) await zoom.press("ArrowRight");
  const canvas = page.locator(".shot canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await shot(page, "07-pronto-para-postar");
  await shot(page, "07b-pronto-pagina-inteira", true);

  // baixa as fotos (zip), confere tamanho 1080×1350 e o texto
  await page.getByRole("button", { name: "Baixar as 2 fotos (.zip)" }).waitFor();
  let [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar as 2 fotos (.zip)" }).click()]);
  expect(download.suggestedFilename() === "post-pronto-fotos.zip", "nome do zip das fotos");
  await download.saveAs(`${OUT}/downloads/fotos.zip`);
  const zipInfo = pythonCheck(
    "import sys,zipfile,io\nfrom PIL import Image\nz=zipfile.ZipFile(sys.argv[1])\nprint(';'.join(n+'='+'x'.join(map(str,Image.open(io.BytesIO(z.read(n))).size)) for n in z.namelist()))",
    `${OUT}/downloads/fotos.zip`,
  );
  expect(zipInfo === "post-pronto-1.jpg=1080x1350;post-pronto-2.jpg=1080x1350", `fotos no zip: ${zipInfo}`);

  await page.getByRole("button", { name: "Copiar legenda" }).click();
  await page.getByText("Legenda copiada.").waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith("Cinco velinhas") && clip.endsWith("#aniversarioinfantil #festadinossauro #5anos #vovólúcia"), `legenda copiada: ${clip}`);
  expect(!clip.includes("—"), "a legenda copiada não pode ter travessão");

  [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Baixar legenda, música e local/ }).click()]);
  await download.saveAs(`${OUT}/downloads/legenda.txt`);
  const txt = readFileSync(`${OUT}/downloads/legenda.txt`, "utf8");
  expect(txt.includes("MÚSICA\nHappy – Pharrell Williams (refrão)") && txt.includes("LOCALIZAÇÃO\nCampinas, São Paulo"), `txt: ${txt}`);
  expect(txt.includes("TEXTO ALTERNATIVO\nMenina de vestido amarelo"), "txt sem texto alternativo");

  [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar tudo junto (.zip)" }).click()]);
  await download.saveAs(`${OUT}/downloads/tudo.zip`);
  const all = pythonCheck("import sys,zipfile\nprint(','.join(zipfile.ZipFile(sys.argv[1]).namelist()))", `${OUT}/downloads/tudo.zip`);
  expect(all === "post-pronto-1.jpg,post-pronto-2.jpg,legenda.txt", `zip completo: ${all}`);

  // Stories 9:16
  await page.getByRole("radio", { name: "9:16" }).click();
  await page.waitForTimeout(500);
  [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar as 2 fotos (.zip)" }).click()]);
  await download.saveAs(`${OUT}/downloads/stories.zip`);
  const storySize = pythonCheck(
    "import sys,zipfile,io\nfrom PIL import Image\nz=zipfile.ZipFile(sys.argv[1])\nprint('x'.join(map(str,Image.open(io.BytesIO(z.read('post-pronto-1.jpg'))).size)))",
    `${OUT}/downloads/stories.zip`,
  );
  expect(storySize === "1080x1920", `stories: ${storySize}`);
  await shot(page, "08-stories");
  await noHorizontalScroll(page, "desktop");
  await ctx.close();

  // ============ 2. Celular, tema escuro ============
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
  await phone.route("https://api.anthropic.com/**", async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const prompt = JSON.parse(req.postData()).messages[0].content.find((c) => c.type === "text").text;
    await route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/event-stream" }, body: sse(JSON.stringify(pick(prompt))) });
  });
  const m = await phone.newPage();
  watch(m);
  await m.goto(URL);
  await m.getByRole("heading", { name: "Post Pronto" }).waitFor();
  await shot(m, "10-celular-inicio");
  await noHorizontalScroll(m, "celular, início");
  await m.locator('input[type="file"]').setInputFiles([{ name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA }]);
  await m.locator(".film .frame:not(.add)").first().waitFor();
  await m.getByLabel("O que está acontecendo").fill(CONTEXT);
  await m.getByRole("button", { name: "Sugerir legendas" }).click();
  await m.getByRole("button", { name: "Pular e gerar assim mesmo" }).click();
  await m.getByRole("heading", { name: "Escolha a legenda" }).waitFor();
  await shot(m, "11-celular-legendas");
  await m.getByRole("button", { name: "Usar esta" }).nth(2).click();
  await m.getByRole("button", { name: "Confirmar legenda" }).click();
  await m.getByRole("heading", { name: "Pronto para postar" }).waitFor();
  await shot(m, "12-celular-pronto");
  await noHorizontalScroll(m, "celular, etapa final");
  await phone.close();

  // ============ 3. Artefato do claude.ai (conta de quem abre a página) ============
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
    ({ QUESTIONS, SUGGESTIONS, REFINE }) => {
      const pick = (p) => (p.includes("Reescreva a legenda") ? REFINE : p.includes("Antes de escrever") ? QUESTIONS : SUGGESTIONS);
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
    { QUESTIONS, SUGGESTIONS, REFINE },
  );
  const a = await art.newPage();
  watch(a);
  await a.goto("https://artefato.teste/");
  await a.getByRole("heading", { name: "Post Pronto" }).waitFor();
  expect((await a.getByRole("button", { name: "Configurar" }).count()) === 0, "no artefato não há chave para configurar");
  expect((await a.evaluate(() => document.documentElement.lang)) === "pt-BR", "idioma da página");
  await a.locator('input[type="file"]').setInputFiles([{ name: "velas.jpg", mimeType: "image/jpeg", buffer: photoA }]);
  await a.locator(".film .frame:not(.add)").first().waitFor();
  await a.getByLabel("O que está acontecendo").fill(CONTEXT);
  await a.getByRole("button", { name: "Sugerir legendas" }).click();
  await a.getByRole("button", { name: "Pular e gerar assim mesmo" }).click();
  await a.getByRole("heading", { name: "Escolha a legenda" }).waitFor();
  const calls = await a.evaluate(() => window.__calls);
  expect(calls.length === 2 && calls[0].images === 1 && calls[0].types[0] === "image/jpeg", "fotos para o Claude no artefato");
  expect(calls[0].tier === "default" && calls[1].input.includes("Não faça perguntas."), "pedido do artefato");
  await a.getByRole("button", { name: "Usar esta" }).nth(1).click();
  await a.getByRole("button", { name: "Gerar outras opções" }).click();
  await a.getByRole("heading", { name: "Escolha a legenda" }).waitFor();
  const more = (await a.evaluate(() => window.__calls))[2];
  expect(more.cache === false && more.input.includes("• Cinco velinhas"), "gerar outras opções deveria pedir respostas novas");
  await a.getByRole("button", { name: "Usar esta" }).nth(1).click();
  await a.getByRole("button", { name: "Confirmar legenda" }).click();
  await a.getByRole("heading", { name: "Pronto para postar" }).waitFor();
  await a.getByRole("button", { name: "Baixar a foto" }).click();
  await a.getByText("Download pronto.").waitFor();
  await a.getByRole("button", { name: /Baixar legenda, música e local/ }).click();
  await a.waitForFunction(() => window.__saved.length === 2);
  const saved = await a.evaluate(() => window.__saved);
  expect(saved[0].filename === "post-pronto.jpg" && saved[0].size > 20000, `foto salva no artefato: ${JSON.stringify(saved[0])}`);
  expect(saved[1].filename === "legenda.txt", "texto salvo no artefato");
  await shot(a, "20-artefato-pronto");
  await art.close();

  if (errors.length) fail(`Erros no console:\n${errors.join("\n")}`);
  console.log(`OK: fluxo completo na página publicada, no celular e no artefato. Capturas em ${OUT}/`);
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
