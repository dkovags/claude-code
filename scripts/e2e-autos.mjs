// Teste de ponta a ponta do Autos: usa o app como uma pessoa usaria e salva capturas de tela.
// Uso: npm run build && node scripts/e2e-autos.mjs  (gera screenshots/autos/ e falha se algo der errado)
// Para usar um Chromium já instalado, informe o caminho em CHROMIUM_PATH.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";

const PORT = 4500 + Math.floor(Math.random() * 300);
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe", detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && resolve());
  server.on("exit", () => reject(new Error("preview saiu")));
  setTimeout(() => reject(new Error("preview não subiu")), 20000);
});
const URL = `http://localhost:${PORT}/autos/`;
const OUT = "screenshots/autos";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const shot = async (page, name) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
};
function watch(page) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
}
const closed = (page) => page.locator(".overlay").first().waitFor({ state: "detached" });
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Dígito verificador CNJ (módulo 97)
function cnj(seq, year, j, tr, origin) {
  const dv = String(98n - (BigInt(seq + year + j + tr + origin + "00") % 97n)).padStart(2, "0");
  return `${seq}-${dv}.${year}.${j}.${tr}.${origin}`;
}

/** PDF no formato do "processo integral" do PJe: capa com partes e índice, e o carimbo "Num. Id - Pág. n" em cada página. */
async function makeCaseFilePdf(path, number) {
  const page = await browser.newPage();
  const stamp = (id, pag) => `<div class="stamp">Assinado eletronicamente por: JUIZ TESTE - 02/10/2026 16:12:00<br>Num. ${id} - Pág. ${pag}</div>`;
  const pages = [
    `<p><b>Número:</b> ${number}</p><p><b>Classe:</b> PROCEDIMENTO COMUM CÍVEL</p><p><b>Órgão julgador:</b> 5ª Vara Cível da Comarca de Mossoró</p>
     <p><b>Última distribuição :</b> 15/03/2026</p><p><b>Valor da causa:</b> R$ 35.000,00</p><p><b>Assuntos:</b> Indenização por Dano Moral</p>
     <p><b>Segredo de justiça?</b> NÃO</p><p><b>Justiça gratuita?</b> SIM</p>
     <table><tr><th>Partes</th><th>Procurador/Terceiro vinculado</th></tr>
     <tr><td>ANA CLIENTE (AUTOR)</td><td>VOCÊ ADVOGADO (ADVOGADO)</td></tr>
     <tr><td>TELEFONIA GAMA S.A. (REU)</td><td>PEDRO DEFESA (ADVOGADO)</td></tr></table>
     <p><b>Documentos</b></p>
     <table><tr><th>Id.</th><th>Data da Assinatura</th><th>Documento</th><th>Tipo</th></tr>
     <tr><td>40000001</td><td>15/03/2026 10:20</td><td>Petição Inicial</td><td>Petição Inicial</td></tr>
     <tr><td>40000002</td><td>15/03/2026 10:20</td><td>Procuração Ana</td><td>Procuração</td></tr>
     <tr><td>40000003</td><td>20/05/2026 14:00</td><td>Contestação Gama</td><td>Contestação</td></tr>
     <tr><td>40000004</td><td>02/10/2026 16:12</td><td>Despacho</td><td>Despacho</td></tr></table>`,
    `<h3>EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 5ª VARA CÍVEL DE MOSSORÓ</h3><p>ANA CLIENTE vem propor AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS em face de TELEFONIA GAMA S.A., pela cobrança indevida e pela negativação do seu nome.</p>${stamp("40000001", 1)}`,
    `<p>Dos pedidos. Requer a condenação da ré ao pagamento de indenização por dano moral e a exclusão da negativação.</p>${stamp("40000001", 2)}`,
    `<h3>PROCURAÇÃO</h3><p>Outorgante: ANA CLIENTE. Outorgado: VOCÊ ADVOGADO.</p>${stamp("40000002", 1)}`,
    `<h3>CONTESTAÇÃO</h3><p>TELEFONIA GAMA S.A. sustenta a regularidade da cobrança e a inexistência de dano moral.</p>${stamp("40000003", 1)}`,
    `<h3>DESPACHO</h3><p>Intime-se a parte autora para, no prazo de 15 (quinze) dias, apresentar réplica à contestação, devendo juntar o extrato atualizado do SPC e comprovante de residência atualizado.</p><p>Após, conclusos.</p>${stamp("40000004", 1)}`,
  ];
  await page.setContent(`<html><head><style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0 }
    .p { height: 1040px; position: relative; padding: 30px; box-sizing: border-box; page-break-after: always }
    .stamp { position: absolute; bottom: 20px; left: 30px; font-size: 9px }
    table { border-collapse: collapse } td, th { padding: 2px 12px 2px 0; text-align: left }
  </style></head><body>${pages.map((p) => `<div class="p">${p}</div>`).join("")}</body></html>`);
  await page.pdf({ path, format: "A4", margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await page.close();
}

const ACORDAO = `Superior Tribunal de Justiça
AgInt no AGRAVO EM RECURSO ESPECIAL Nº 2.345.678 - RN (2025/0123456-7)
RELATOR : MINISTRO JOÃO EXEMPLO
AGRAVANTE : TELEFONIA GAMA S.A.
ADVOGADO : PEDRO DEFESA - RN001111
AGRAVADO : CARLOS TESTE
ADVOGADO : VOCÊ ADVOGADO - RN002222
EMENTA
AGRAVO INTERNO NO AGRAVO EM RECURSO ESPECIAL. COBRANÇA INDEVIDA DE SERVIÇOS DE TELEFONIA. NEGATIVAÇÃO. DANO MORAL CONFIGURADO. AGRAVO INTERNO NÃO PROVIDO.
1. A inscrição indevida em cadastro de inadimplentes, decorrente de cobrança de serviço não contratado, gera dano moral presumido.
2. Agravo interno a que se nega provimento.
ACÓRDÃO
Vistos e relatados estes autos, acordam os Ministros da QUARTA TURMA do Superior Tribunal de Justiça, por unanimidade, negar provimento ao agravo interno.
Brasília, 03 de março de 2026(Data do Julgamento)`;

const PETICAO = `Nesse sentido:

"AGRAVO INTERNO NO AGRAVO EM RECURSO ESPECIAL. COBRANÇA INDEVIDA DE SERVIÇOS DE TELEFONIA. [...] 1. A inscrição indevida em cadastro de inadimplentes gera sempre dano moral presumido."
(STJ, AgInt no AREsp 2.345.678/RN, Rel. Min. João Exemplo, Quarta Turma, j. 03/03/2026, DJe 06/03/2026)

Também: STJ, REsp 1.111.111/SP, Rel. Min. Fulano Beltrano, Sétima Turma, j. 10/10/2023, DJe 05/10/2023.

Aplica-se a Súmula 297 do STJ e, por analogia, a Súmula 800 do STF.`;

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "pt-BR", reducedMotion: "reduce", acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(URL);
  await page.getByText("Boas-vindas ao Autos").waitFor();
  await shot(page, "01-boas-vindas");

  // exemplo: dois processos fictícios com prazos, documentos e súmulas
  await page.getByRole("button", { name: /Ver um exemplo/ }).click();
  await page.getByRole("heading", { name: "Maria Exemplo x Banco Alfa (exemplo)" }).waitFor();
  await page.getByText(/parece pedir "Réplica"|Réplica/).first().waitFor();
  await shot(page, "02-processo-resumo");

  await page.getByRole("tab", { name: /Expedientes e prazos/ }).click();
  await page.getByText("Documentos para instruir a petição").first().waitFor();
  await page.getByRole("button", { name: /Memória de cálculo/ }).first().click();
  await page.getByText(/Publicação: primeiro dia útil seguinte/).waitFor();
  await shot(page, "03-processo-prazos");

  await page.goto(URL + "#/");
  await page.getByText("Próximos prazos").waitFor();
  await shot(page, "04-painel");

  // processo integral do PJe
  const number = cnj("0805555", "2026", "8", "20", "5106");
  const pdfPath = `${OUT}/processo-integral.pdf`;
  await makeCaseFilePdf(pdfPath, number);
  expect(statSync(pdfPath).size > 1000, "PDF de teste não foi gerado");
  await page.goto(URL + "#/processos");
  await page.getByRole("button", { name: /Importar PDF do processo/ }).click();
  await page.locator(".modal input[type=file]").setInputFiles(pdfPath);
  await page.getByText("Conferir o processo").waitFor();
  await page.getByText("Partes encontradas: quem é o seu cliente?").waitFor();
  expect(await page.getByText(number).count(), "número do processo não foi lido da capa");
  expect((await page.locator(".doc-preview-row").count()) === 5, `esperava 5 documentos, veio ${await page.locator(".doc-preview-row").count()}`);
  await shot(page, "05-importar-processo-integral");
  await page.getByRole("button", { name: "Criar o processo" }).click();
  await closed(page);
  await page.getByRole("heading", { name: "Ana Cliente x Telefonia Gama S.A." }).waitFor();
  // o último despacho ainda não tem expediente: o resumo avisa o que ele pede
  await page.getByRole("tab", { name: /Resumo/ }).click();
  await page.getByText(/parece pedir "Réplica"/).waitFor();
  await shot(page, "06-resumo-com-sugestao");
  await page.getByRole("tab", { name: /Documentos/ }).click();
  await page.getByRole("button", { name: /\d+ documentos/ }).click();
  await page.getByText("Contestação Gama").waitFor();
  await shot(page, "07-documentos");

  // pesquisa nos documentos do processo
  await page.getByLabel("Pesquisar nos documentos do processo").fill("negativação");
  await page.locator(".result").first().waitFor();
  await shot(page, "08-pesquisa-no-processo");
  await page.locator(".result").first().click();
  await page.locator("mark.hit").first().waitFor();
  await page.getByRole("button", { name: "Fechar" }).click();
  await closed(page);

  // o despacho pede réplica: registra o expediente a partir do documento
  await page.getByLabel("Pesquisar nos documentos do processo").fill("");
  const despacho = page.locator(".doc-row", { hasText: "Despacho" }).first();
  await despacho.getByRole("button", { name: /Analisar/ }).click();
  await page.getByText("Exige petição: Réplica").waitFor();
  expect((await page.locator(".draft-item input").count()) >= 2, "documentos pedidos no despacho não viraram itens");
  await shot(page, "09-expediente-analisado");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.getByRole("tab", { name: /Expedientes e prazos/ }).click();
  await page.getByText("Extrato atualizado do SPC", { exact: true }).waitFor();

  // jurisprudência: cola o acórdão e confere as partes
  await page.goto(URL + "#/jurisprudencia");
  await page.getByRole("button", { name: /Nova jurisprudência/ }).click();
  await page.getByPlaceholder(/RECURSO ESPECIAL/).fill(ACORDAO);
  await page.getByRole("button", { name: "Ler e preencher" }).click();
  expect((await page.locator(".modal input[list=classes]").inputValue()) === "AgInt no AREsp", "classe não foi lida");
  expect((await page.locator(".party-form").count()) === 2, "partes não foram identificadas");
  await page.getByRole("textbox", { name: "Fonte" }).fill("DJe");
  await page.locator(".modal input[type=date]").nth(1).fill("2026-03-06");
  await page.getByText(/Conferi os dados na fonte oficial/).click();
  await shot(page, "10-nova-jurisprudencia");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.getByText("Parte em comum com os seus processos").waitFor();
  await shot(page, "11-jurisprudencia");

  // verificação de citações
  await page.goto(URL + "#/citacoes");
  await page.getByPlaceholder(/Cole aqui a petição/).fill(PETICAO);
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.locator(".check-card").first().waitFor();
  const levels = await page.locator(".check-card").evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith("level-"))));
  expect(
    JSON.stringify(levels) === JSON.stringify(["level-alerta", "level-erro", "level-ok", "level-erro"]),
    `níveis inesperados: ${JSON.stringify(levels)}`,
  );
  await page.locator(".diff").first().waitFor();
  await shot(page, "12-verificar-citacoes");

  // prazos, calculadora e exportação para a agenda
  await page.goto(URL + "#/prazos");
  await page.getByText("Prazos e audiências").first().waitFor();
  await shot(page, "13-prazos");
  const [ics] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Exportar para a agenda/ }).click()]);
  const icsText = readFileSync(await ics.path(), "utf8");
  expect(icsText.includes("BEGIN:VEVENT") && icsText.includes("Réplica"), "arquivo .ics sem os prazos");
  await page.getByRole("button", { name: /Calculadora/ }).click();
  await page.getByText(/Vencimento:/).waitFor();
  await shot(page, "14-calculadora");
  await page.getByRole("button", { name: "Fechar" }).click();

  // cópia de segurança
  await page.goto(URL + "#/configuracoes");
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Fazer cópia de segurança/ }).click()]);
  expect(statSync(await zip.path()).size > 2000, "cópia de segurança vazia");
  await shot(page, "15-configuracoes");

  // os dados ficam no aparelho: recarrega e continua tudo lá
  await page.reload();
  await page.goto(URL + "#/processos");
  await page.getByText("Ana Cliente x Telefonia Gama S.A.").waitFor();
  expect((await page.locator(".case-row").count()) === 3, "processos não ficaram guardados");

  // celular
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "pt-BR", reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  watch(m);
  await m.goto(URL);
  await m.getByRole("button", { name: /Ver um exemplo/ }).click();
  await m.getByText("Maria Exemplo x Banco Alfa (exemplo)").first().waitFor();
  await shot(m, "16-celular-processo");
  await m.goto(URL + "#/");
  await m.getByText("Próximos prazos").waitFor();
  await shot(m, "17-celular-painel");
  await m.goto(URL + "#/prazos");
  await m.locator(".agenda-row").first().waitFor();
  await shot(m, "18-celular-prazos");
  await m.locator(".agenda-main").first().click();
  await m.locator(".modal").waitFor();
  await shot(m, "19-celular-providencia");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 0, `a página rola para o lado no celular (${overflow}px)`);

  if (errors.length) throw new Error("Erros no navegador:\n" + errors.join("\n"));
  console.log(`ok: teste de ponta a ponta do Autos passou (capturas em ${OUT}/)`);
} catch (e) {
  console.error(e);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}
