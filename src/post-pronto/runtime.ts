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

/** Pede um recurso do Claude; null quando esta tela não oferece. */
export async function getCapability<T>(name: string): Promise<T | null> {
  if (!inClaude()) return null;
  try {
    return ((await window.claude!.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
}
