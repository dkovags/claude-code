// O que o claude.ai oferece a uma página publicada como artefato: window.claude.use(nome).

export interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

/** true quando a página está aberta dentro do Claude (artefato). */
export function inClaude(): boolean {
  return typeof window !== "undefined" && typeof window.claude?.use === "function";
}

/** Endereço do artefato publicado, para abrir no navegador quando o app não deixa escolher fotos. */
export const ARTIFACT_URL = "https://claude.ai/artifact/QgwA6tj19x3bCCBwy4Cywv";

/**
 * Celular: no navegador ("android", "ios") ou dentro de um app ("android-app", "ios-app"), como o app do Claude.
 * No iPhone, o navegador se identifica com "Safari/"; um app que abre páginas por dentro, não.
 */
export function mobileKind(ua = typeof navigator === "undefined" ? "" : navigator.userAgent) {
  if (/Android/i.test(ua)) return /; wv\)/.test(ua) ? "android-app" : "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return /Safari\//.test(ua) ? "ios" : "ios-app";
  return null;
}

/** Tela de toque (celular ou tablet), pelo tipo de ponteiro principal; na dúvida, pelo nome do aparelho. */
export function touchScreen(): boolean {
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
  } catch {
    // navegador sem matchMedia
  }
  return mobileKind() !== null;
}

/** Pede um recurso do Claude; null quando esta tela não oferece. */
export async function getCapability<T>(name: string): Promise<T | null> {
  if (!inClaude()) return null;
  try {
    return ((await window.claude!.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}
