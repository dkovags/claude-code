// Imagem da página inteira, para guardar ou mandar para alguém. No celular a captura de tela pode estar bloqueada (na aba
// anônima do Chrome, por exemplo), e a página costuma ser mais comprida que a tela.

// Limites da imagem: acima disso, alguns celulares não conseguem criar o canvas.
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 32_000;

/** Densidade da imagem: a da tela (até 2x), menor quando a página é comprida demais para caber nos limites. */
export function captureScale(width: number, height: number, pixelRatio: number): number {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const fit = Math.min(Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / w, MAX_SIDE / h);
  return Math.max(0.5, Math.min(pixelRatio || 1, 2, fit));
}

/** Nome do arquivo com a data e a hora: post-pronto-tela-2026-10-24-1936.png. */
export function captureName(date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `post-pronto-tela-${day}-${two(date.getHours())}${two(date.getMinutes())}.png`;
}

/** Desenha o elemento (com tudo o que está fora da tela) numa imagem PNG. */
export async function captureElement(el: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const { width, height } = el.getBoundingClientRect();
  const canvas = await html2canvas(el, {
    scale: captureScale(width, height, window.devicePixelRatio),
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    logging: false,
    // o próprio botão e os avisos passageiros ficam de fora
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.capture === "skip",
    onclone: (doc) => {
      // os ícones usam a cor do texto em volta, que um SVG desenhado como imagem não herda
      for (const svg of doc.querySelectorAll("svg")) {
        svg.setAttribute("color", doc.defaultView?.getComputedStyle(svg).color ?? "");
      }
    },
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("imagem vazia"))), "image/png"),
  );
}
