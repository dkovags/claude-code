// Teste de ponta a ponta: usa o app como uma pessoa usaria e salva capturas de tela.
// Uso: npm run build && node scripts/e2e.mjs  (gera screenshots/ e falha se algo der errado)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 4200 + Math.floor(Math.random() * 300);
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe", detached: true });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => String(d).includes("Local") && resolve());
  server.on("exit", () => reject(new Error("preview saiu")));
  setTimeout(() => reject(new Error("preview não subiu")), 20000);
});
const URL = `http://localhost:${PORT}/`;
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
};
// espera até a lista ter n itens
async function waitCount(locator, n, msg) {
  for (let i = 0; i < 40; i++) {
    if ((await locator.count()) === n) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`${msg} (esperava ${n}, veio ${await locator.count()})`);
}
// espera o formulário fechar depois de salvar
const closed = (page) => page.locator(".overlay").first().waitFor({ state: "detached" });
function watch(page) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "pt-BR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(URL);
  await shot(page, "01-boas-vindas");
  await page.getByPlaceholder("Seu nome").fill("Diego Kovags");
  await page.getByPlaceholder("nome@exemplo.com").fill("diego@example.com");
  await page.getByRole("button", { name: "Começar" }).click();
  await page.getByText("Bem-vindo(a)!").waitFor();
  await shot(page, "02-painel-vazio");

  // cria o grupo com duas pessoas novas
  await page.getByRole("button", { name: "Criar um grupo" }).click();
  await page.getByPlaceholder("Ex.: Apartamento, Viagem para Bonito").fill("Apartamento");
  const picker = page.getByLabel("Adicionar pessoa");
  await picker.fill("Ana Souza");
  await page.getByLabel("E-mail da nova pessoa").fill("ana@example.com");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await picker.fill("Bruno Lima");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await shot(page, "03-criar-grupo");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("heading", { name: "Apartamento" }).waitFor();

  // despesa dividida igualmente
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await page.getByLabel("Descrição").fill("Supermercado do mês");
  await page.getByLabel("Valor").fill("300");
  await shot(page, "04-adicionar-despesa");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);

  // despesa paga pela Ana
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await page.getByLabel("Descrição").fill("Internet");
  await page.getByLabel("Valor").fill("119,90");
  await page.locator(".paid-split .pill").first().click();
  await page.getByRole("button", { name: "Ana Souza" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);

  // despesa por porcentagem
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await page.getByLabel("Descrição").fill("Conta de luz");
  await page.getByLabel("Valor").fill("200");
  await page.locator(".paid-split .pill").nth(1).click();
  await page.getByRole("tab").nth(2).click();
  const inputs = page.locator(".split-row input");
  await inputs.nth(0).fill("50");
  await inputs.nth(1).fill("25");
  await inputs.nth(2).fill("25");
  await shot(page, "05-divisao-porcentagem");
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.waitForTimeout(300);
  await shot(page, "06-grupo");

  // abre o detalhe da primeira despesa
  await page.locator(".expense-row").first().click();
  await page.getByPlaceholder("Adicionar um comentário").fill("Paguei no Pix, beleza?");
  await page.getByRole("button", { name: "Comentar" }).click();
  await shot(page, "07-detalhe");

  // painel
  await page.getByRole("link", { name: "Painel" }).click();
  await page.waitForTimeout(200);
  await shot(page, "08-painel");

  // acertar contas com a Ana
  await page.getByRole("button", { name: "Acertar contas" }).first().click();
  await shot(page, "09-acertar-escolha");
  await page.locator(".settle-choice").first().click();
  await shot(page, "10-acertar-form");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);

  await page.getByRole("link", { name: "Atividade recente" }).click();
  await page.waitForTimeout(200);
  await shot(page, "11-atividade");

  // despesa fora de grupo: amigo existente + amigo novo, vários pagadores e divisão por partes
  await page.getByRole("link", { name: "Painel" }).click();
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  const who = page.getByLabel("Participantes");
  await who.fill("Bru");
  await page.locator(".suggestion", { hasText: "Bruno Lima" }).click();
  await who.fill("Carla Dias");
  await page.locator(".suggestion.add").click();
  await page.getByLabel("Descrição").fill("Uber para o show");
  await page.getByLabel("Valor").fill("40+50");
  if (!(await page.getByText("= R$").isVisible())) throw new Error("prévia da conta não apareceu");
  await page.locator(".paid-split .pill").first().click();
  await page.getByRole("button", { name: "Várias pessoas" }).click();
  const payers = page.locator(".split-row input");
  await payers.nth(0).fill("60");
  await payers.nth(1).fill("30");
  await shot(page, "12-varios-pagadores");
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.locator(".paid-split .pill").nth(1).click();
  await page.getByRole("tab").nth(3).click();
  const shares = page.locator(".split-row input");
  await shares.nth(0).fill("2");
  await shares.nth(1).fill("1");
  await shares.nth(2).fill("1");
  await shot(page, "13-divisao-partes");
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);

  // página do amigo
  await page.locator(".nav-link", { hasText: "Carla Dias" }).click();
  await page.waitForTimeout(200);
  await shot(page, "14-amigo");

  // editar valor e ver histórico
  await page.locator(".expense-row").first().click();
  await page.getByRole("button", { name: "Editar despesa" }).click();
  await page.getByLabel("Valor").fill("100");
  await page.locator(".paid-split .pill").first().click();
  const payers2 = page.locator(".split-row input");
  await payers2.nth(0).fill("70");
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  // o detalhe continua aberto na lista depois de salvar
  await page.locator("details.history summary").click();
  await shot(page, "15-historico");
  const hist = await page.locator("details.history").innerText();
  if (!hist.includes("valor de R$")) throw new Error("histórico sem a mudança de valor: " + hist);

  // excluir e desfazer
  await page.locator(".nav-link", { hasText: "Apartamento" }).click();
  await page.getByRole("heading", { name: "Apartamento" }).waitFor();
  const before = await page.locator(".expense-row").count();
  await page.locator(".expense-row", { hasText: "Supermercado" }).click();
  await page.getByRole("button", { name: "Excluir" }).click();
  await page.locator(".confirm-modal").getByRole("button", { name: "Excluir" }).click();
  await waitCount(page.locator(".expense-row"), before - 1, "despesa não foi excluída");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await waitCount(page.locator(".expense-row"), before, "desfazer não restaurou");

  // saldos, totais e gráficos
  await page.getByRole("button", { name: "Saldos" }).click();
  await shot(page, "16-saldos");
  await page.getByLabel("Fechar").click();
  await page.getByRole("button", { name: "Totais" }).click();
  await shot(page, "17-totais");
  await page.getByLabel("Fechar").click();
  await page.getByRole("button", { name: "Gráficos" }).click();
  await shot(page, "18-graficos");
  await page.getByLabel("Fechar").click();

  // configurações do grupo
  await page.getByRole("button", { name: "Configurações" }).click();
  await shot(page, "19-config-grupo");
  await page.getByLabel("Fechar").click();

  // despesa recorrente com data antiga gera as ocorrências vencidas
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await page.getByLabel("Descrição").fill("Aluguel");
  await page.getByLabel("Valor").fill("2400");
  await page.getByLabel("Data").first().fill("2026-08-05");
  await page.getByRole("button", { name: "Observações e repetição" }).click();
  await page.locator(".repeat-field select").selectOption("monthly");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.reload();
  await page.waitForTimeout(300);
  await waitCount(page.locator(".expense-row", { hasText: "Aluguel" }), 3, "aluguéis de ago, set e out");
  await shot(page, "19b-recorrente");

  // busca
  await page.getByRole("link", { name: "Todas as despesas" }).click();
  await page.getByLabel("Buscar despesas").fill("luz");
  await page.waitForTimeout(150);
  await waitCount(page.locator(".expense-row"), 1, "busca por 'luz'");
  await shot(page, "19c-busca");

  // backup: baixar e restaurar
  await page.goto(URL + "#/account");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Fazer backup" }).click()]);
  const backupPath = "screenshots/backup.json";
  await download.saveAs(backupPath);
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page.locator(".confirm-modal").getByRole("button", { name: "Importar" }).click();
  await page.waitForTimeout(200);

  // chave Pix: a Ana cadastra a dela e ela aparece quando vou pagá-la
  await page.locator(".nav-link", { hasText: "Ana Souza" }).click();
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByPlaceholder("CPF, e-mail, celular ou chave aleatória").fill("ana@pix.com");
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await page.getByLabel("Descrição").fill("Sorvete");
  await page.getByLabel("Valor").fill("20");
  await page.locator(".paid-split .pill").first().click();
  await page.getByRole("button", { name: "Ana Souza" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await closed(page);
  await page.getByRole("button", { name: "Acertar contas" }).first().click();
  await page.locator(".settle-choice", { hasText: "Você deve" }).first().click();
  await page.locator(".modal .pix code", { hasText: "ana@pix.com" }).waitFor();
  await shot(page, "19d-pix");
  await page.getByLabel("Fechar").click();

  // celular
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", reducedMotion: "reduce" });
  const state = await page.evaluate(() => localStorage.getItem("rateio:data:v1"));
  await m.addInitScript((s) => localStorage.setItem("rateio:data:v1", s), state);
  const mp = await m.newPage();
  watch(mp);
  await mp.goto(URL);
  await mp.waitForTimeout(300);
  await shot(mp, "20-celular-grupos");
  await mp.locator(".list-card").first().click();
  await mp.waitForTimeout(200);
  await shot(mp, "21-celular-grupo");
  await mp.locator(".expense-row").nth(1).click();
  await mp.waitForTimeout(200);
  await shot(mp, "22-celular-detalhe");
  await mp.getByLabel("Fechar").click();
  await mp.getByRole("button", { name: "Adicionar despesa" }).click();
  await mp.waitForTimeout(200);
  await shot(mp, "23-celular-adicionar");
  await mp.getByLabel("Fechar").click();
  await mp.getByRole("link", { name: "Amigos" }).click();
  await mp.waitForTimeout(200);
  await shot(mp, "24-celular-amigos");
  await mp.getByRole("link", { name: "Atividade" }).click();
  await mp.waitForTimeout(200);
  await shot(mp, "25-celular-atividade");
  await mp.getByRole("link", { name: "Conta" }).click();
  await mp.waitForTimeout(200);
  await shot(mp, "26-celular-conta");

  // tema escuro
  const d = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark", locale: "pt-BR", reducedMotion: "reduce" });
  await d.addInitScript((s) => localStorage.setItem("rateio:data:v1", s), state);
  const dp = await d.newPage();
  watch(dp);
  await dp.goto(URL);
  await dp.locator(".nav-link", { hasText: "Apartamento" }).click();
  await dp.waitForTimeout(200);
  await shot(dp, "30-escuro-grupo");
} catch (e) {
  errors.push(`falha: ${e.message}`);
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    server.kill();
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("e2e ok");
process.exit(0);
