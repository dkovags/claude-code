/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** Post Pronto: true na versão de arquivo único publicada como artefato do Claude. */
declare const __ARTIFACT__: boolean;

interface ImportMetaEnv {
  /** Configuração do Firebase em JSON (opcional). */
  readonly VITE_FIREBASE_CONFIG?: string;
  /** Host dos emuladores do Firebase, para desenvolvimento (opcional). */
  readonly VITE_FIREBASE_EMULATOR?: string;
}
