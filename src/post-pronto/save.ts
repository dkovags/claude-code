// Entregar os arquivos prontos: dentro do Claude pelo recurso "downloads" (a pessoa confirma o download);
// fora dele, pelo download comum do navegador e, no celular, pelo menu de compartilhar.
import { getCapability, inClaude } from "./runtime";

export type SaveResult = "saved" | "declined";

export interface Saver {
  save(filename: string, data: Blob): Promise<SaveResult>;
  /** Menu de compartilhar do celular (abre o Instagram direto); só fora do Claude. */
  share?: (files: File[]) => Promise<boolean>;
}

interface Downloads {
  save(request: { filename: string; data: Blob }): Promise<{ status: string }>;
}

function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([new Uint8Array([0xff])], "teste.jpg", { type: "image/jpeg" })] })
    );
  } catch {
    return false;
  }
}

/** null quando esta tela não consegue entregar arquivos (dá para copiar a legenda mesmo assim). */
export async function connectSaver(): Promise<Saver | null> {
  if (inClaude()) {
    const downloads = await getCapability<Downloads>("downloads");
    if (!downloads) return null;
    return {
      async save(filename, data) {
        try {
          await downloads.save({ filename, data });
          return "saved";
        } catch (e) {
          const code = (e as { code?: string } | null)?.code;
          if (code === "declined") return "declined";
          if (code === "rate_limited") {
            throw new Error("Já há um download esperando sua confirmação. Responda a ele e tente de novo.");
          }
          throw new Error("Não foi possível baixar o arquivo nesta tela.");
        }
      },
    };
  }
  return {
    async save(filename, data) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(data);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return "saved";
    },
    share: canShareFiles()
      ? async (files) => {
          try {
            await navigator.share({ files });
            return true;
          } catch (e) {
            if ((e as Error).name === "AbortError") return false;
            throw new Error("Não foi possível abrir o menu de compartilhar.");
          }
        }
      : undefined,
  };
}

/** Copia texto; se o navegador não deixar, tenta o jeito antigo. Devolve false se nada funcionou. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
