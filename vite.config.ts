import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import pkg from "./package.json" with { type: "json" };

// base relativa: o app funciona em qualquer subpasta (ex.: GitHub Pages em /<repositório>/)
// Duas páginas: o Rateio (index.html) e o Post Pronto (post-pronto/index.html)
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __ARTIFACT__: "false" },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        "post-pronto": fileURLToPath(new URL("./post-pronto/index.html", import.meta.url)),
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
