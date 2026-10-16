import { useEffect, useReducer } from "react";

/** Convite de instalação do navegador (Android/Chrome), guardado para mostrar um botão "Instalar". */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Função para abrir o convite de instalação, ou null se o navegador não oferecer (ou o app já estiver instalado). */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  if (!deferred) return null;
  const ev = deferred;
  return async () => {
    await ev.prompt();
    await ev.userChoice.catch(() => undefined);
    deferred = null;
    notify();
  };
}
