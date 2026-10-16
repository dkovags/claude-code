import { Copy } from "lucide-react";
import type { Person } from "../../domain/types";
import { useUI } from "../context";

/** Copia um texto para a área de transferência (com alternativa para navegadores antigos). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Chave Pix de alguém, com botão para copiar. */
export function PixKey({ person, label }: { person?: Person; label?: string }) {
  const ui = useUI();
  if (!person?.pix) return null;
  const pix = person.pix;
  return (
    <div className="pix">
      <span className="pix-label">{label || `Chave Pix de ${person.name.split(" ")[0]}`}</span>
      <span className="pix-row">
        <code>{pix}</code>
        <button
          type="button"
          className="chip-btn"
          onClick={async () => ui.toast((await copyText(pix)) ? "Chave Pix copiada." : "Não foi possível copiar.")}
        >
          <Copy size={14} /> Copiar
        </button>
      </span>
    </div>
  );
}
