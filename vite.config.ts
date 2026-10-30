import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import pkg from "./package.json" with { type: "json" };

// base relativa: o app funciona em qualquer subpasta (ex.: GitHub Pages em /<repositório>/)
// Duas páginas: o Rateio (index.html) e o Autos (autos/index.html)
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        autos: fileURLToPath(new URL("./autos/index.html", import.meta.url)),
      },
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
