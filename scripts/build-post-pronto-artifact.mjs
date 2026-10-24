// Gera o Post Pronto num arquivo HTML único, para publicar como artefato no claude.ai.
// Uso: npm run build:artifact  (gera dist-artifact/post-pronto.html)
// Dentro do Claude a página usa a conta de quem a abre; por isso esta versão não leva o SDK da API.
import react from "@vitejs/plugin-react";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import pkg from "../package.json" with { type: "json" };

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../dist-artifact/", import.meta.url));
const pageDir = new URL("../dist-artifact/post-pronto/", import.meta.url);

await build({
  configFile: false,
  root,
  base: "./",
  publicDir: false,
  logLevel: "warn",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __ARTIFACT__: "true" },
  build: {
    outDir,
    emptyOutDir: true,
    target: "es2020",
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    // tudo vai num arquivo só, inclusive o gerador da imagem da tela
    chunkSizeWarningLimit: 1024,
    rolldownOptions: {
      input: fileURLToPath(new URL("../post-pronto/index.html", import.meta.url)),
      output: { codeSplitting: false },
    },
  },
});

const read = (href) => readFileSync(new URL(href, pageDir), "utf8");
let html = readFileSync(new URL("index.html", pageDir), "utf8");

// JS e CSS dentro da própria página
html = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
  (_, src) => `<script type="module">${read(src).replace(/<\/script/gi, "<\\/script")}</script>`,
);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`);
if (/src="\.\.?\/|href="\.\.?\/assets/.test(html)) throw new Error("Sobrou arquivo externo no HTML do artefato");

// O claude.ai envolve a página no próprio esqueleto (doctype, head, charset e viewport): fica só o conteúdo
html = html
  .replace(/<!doctype html>\s*/i, "")
  .replace(/<\/?html[^>]*>\s*/gi, "")
  .replace(/<\/?head>\s*/gi, "")
  .replace(/<\/?body>\s*/gi, "")
  .replace(/<meta charset[^>]*>\s*/i, "")
  .replace(/<meta name="viewport"[^>]*>\s*/i, "")
  .replace(/<link\s+rel="icon"[\s\S]*?\/>\s*/i, "")
  .trim();
if (!html.startsWith("<title>")) throw new Error("O <title> precisa vir primeiro");
if (/dangerouslyAllowBrowser/.test(html)) throw new Error("O SDK da API não deveria entrar na versão do artefato");

rmSync(fileURLToPath(pageDir), { recursive: true, force: true });
rmSync(fileURLToPath(new URL("../dist-artifact/assets/", import.meta.url)), { recursive: true, force: true });
writeFileSync(new URL("../dist-artifact/post-pronto.html", import.meta.url), html + "\n");
console.log(`dist-artifact/post-pronto.html (${(html.length / 1024).toFixed(0)} KB)`);
