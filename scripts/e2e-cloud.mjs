// Teste de ponta a ponta do modo sincronizado: dois usuários em navegadores separados, com os emuladores do Firebase.
// Uso: npm run test:e2e-cloud  (sobe os emuladores, gera a versão de teste e roda este script)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const PORT = 4300 + Math.floor(Math.random() * 300);
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-cloud", "--port", String(PORT), "--strictPort"], {
  stdio: "pipe",
  detached: true,
});
let serverLog = "";
await new Promise((resolve, reject) => {
  server.stdout.on("data", (d) => {
    serverLog += d;
    if (String(d).includes("Local")) resolve();
  });
  server.stderr.on("data", (d) => (serverLog += d));
  server.on("exit", () => reject(new Error("preview saiu:\n" + serverLog)));
  setTimeout(() => reject(new Error("preview não subiu")), 20000);
});
const URL = `http://localhost:${PORT}/`;
mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch();
const errors = [];

async function user(name, email, mobile = false) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", reducedMotion: "reduce" }
      : { viewport: { width: 1280, height: 860 }, locale: "pt-BR", reducedMotion: "reduce" },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|offline|ERR_|WebChannelConnection/.test(m.text())) errors.push(`${name} console: ${m.text()}`);
  });
  await page.goto(URL);
  // primeira tela: escolhe o modo sincronizado (o app recarrega e mostra a tela de login)
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Entrar com Google" }).click()]);
  await page.getByText("Usar sem conta, só neste aparelho").waitFor();
  // o pop-up do Google precisa de apis.google.com; nos testes, o login é feito direto no emulador
  await page.waitForFunction(() => typeof window.__rateioEmulatorLogin === "function");
  await page.evaluate(([e, n]) => window.__rateioEmulatorLogin(e, n), [email, name]);
  await page.locator(".topbar").waitFor({ timeout: 20000 });
  return page;
}
const shot = async (page, name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `screenshots/${name}.png` });
};
const closed = (page) => page.locator(".overlay").first().waitFor({ state: "detached" });

try {
  const diego = await user("Diego Kovags", "diego@example.com");
  await shot(diego, "40-nuvem-diego-entrou");

  await diego.getByRole("button", { name: "Criar um grupo" }).click();
  await diego.getByPlaceholder("Ex.: Apartamento, Viagem para Bonito").fill("Viagem a Bonito");
  await diego.locator(".type-option", { hasText: "Viagem" }).click();
  await diego.getByLabel("Adicionar pessoa").fill("Ana Souza");
  await diego.getByLabel("E-mail da nova pessoa").fill("ana@example.com");
  await diego.getByRole("button", { name: "Adicionar", exact: true }).click();
  await diego.getByRole("button", { name: "Salvar" }).click();
  await diego.getByRole("heading", { name: "Viagem a Bonito" }).waitFor();
  await diego.getByRole("button", { name: "Adicionar uma despesa" }).first().click();
  await diego.getByLabel("Descrição").fill("Pousada");
  await diego.getByLabel("Valor").fill("1200");
  await diego.getByRole("button", { name: "Salvar" }).click();
  await closed(diego);
  await shot(diego, "41-nuvem-diego-grupo");

  // a Ana entra pelo celular e já encontra o grupo e a despesa
  const ana = await user("Ana Souza", "ana@example.com", true);
  await ana.locator(".list-card", { hasText: "Viagem a Bonito" }).waitFor({ timeout: 15000 });
  await shot(ana, "42-nuvem-ana-grupos");
  await ana.locator(".list-card", { hasText: "Viagem a Bonito" }).click();
  await ana.locator(".expense-row", { hasText: "Pousada" }).waitFor();
  await shot(ana, "43-nuvem-ana-grupo");

  // a Ana lança uma despesa e o Diego recebe na hora
  await ana.getByRole("button", { name: "Adicionar despesa" }).click();
  await ana.getByLabel("Descrição").fill("Passeio de barco");
  await ana.getByLabel("Valor").fill("300");
  await ana.getByRole("button", { name: "Salvar" }).click();
  await closed(ana);
  await diego.locator(".expense-row", { hasText: "Passeio de barco" }).waitFor({ timeout: 15000 });
  await shot(diego, "44-nuvem-diego-recebeu");

  // saldo do Diego: recebe 600 da pousada e deve 150 do passeio
  const side = await diego.locator(".right-col").innerText();
  if (!side.includes("450,00")) throw new Error("saldo do Diego deveria mostrar R$ 450,00: " + side);

  await diego.goto(URL + "#/account");
  await shot(diego, "45-nuvem-conta");
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
console.log("e2e nuvem ok");
process.exit(0);
