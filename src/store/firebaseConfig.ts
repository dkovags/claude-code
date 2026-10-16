import { FIREBASE_CONFIG } from "../config";

/** Configuração do Firebase: variável VITE_FIREBASE_CONFIG (JSON) ou o valor em src/config.ts. */
export function getFirebaseConfig(): Record<string, string> | null {
  const env = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (env && env.trim()) {
    try {
      const parsed = JSON.parse(env);
      if (parsed && typeof parsed === "object" && parsed.projectId) return parsed;
    } catch {
      console.error("VITE_FIREBASE_CONFIG não é um JSON válido.");
    }
  }
  return FIREBASE_CONFIG && FIREBASE_CONFIG.projectId ? FIREBASE_CONFIG : null;
}

/** Emuladores locais (desenvolvimento): VITE_FIREBASE_EMULATOR=localhost */
export function getEmulator(): { host: string; firestorePort: number; authPort: number } | undefined {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
  return host ? { host, firestorePort: 8085, authPort: 9099 } : undefined;
}

const MODE_KEY = "rateio:mode";
export type Mode = "local" | "cloud";

export function readMode(): Mode | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === "cloud" || m === "local" ? m : null;
  } catch {
    return null;
  }
}

/** Troca entre "só neste aparelho" e "sincronizado na nuvem" e recarrega o app. */
export function switchMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* sem armazenamento: fica no modo atual */
  }
  window.location.reload();
}
