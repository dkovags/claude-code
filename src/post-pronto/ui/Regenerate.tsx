import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Na tela de escolha: gerar todas as opções de novo. Acrescentar ou corrigir uma informação (ou editar o contexto
 * inteiro) é opcional; sem nada novo, o Claude só traz opções diferentes.
 */
export function RegenerateBox({
  context,
  what,
  onRegenerate,
  onMore,
}: {
  /** O contexto que o Claude recebeu. */
  context: string;
  /** "versões" nos stories, "legendas" no feed. */
  what: string;
  onRegenerate: (context: string, update: string) => void;
  onMore: () => void;
}) {
  const [update, setUpdate] = useState("");
  const [edited, setEdited] = useState(context);
  // deu certo: a informação nova entrou no contexto e o campo volta a ficar vazio
  useEffect(() => {
    setEdited(context);
    setUpdate("");
  }, [context]);
  const changed = update.trim() !== "" || edited.trim() !== context.trim();

  return (
    <section className="regen" aria-labelledby="pp-regen-title">
      <h3 id="pp-regen-title">Quer outras {what}?</h3>
      <div className="field">
        <label className="label" htmlFor="pp-update">
          Acrescente ou corrija uma informação (opcional)
        </label>
        <textarea
          id="pp-update"
          rows={2}
          value={update}
          onChange={(e) => setUpdate(e.target.value)}
          placeholder="Ex.: a festa foi surpresa; quem fez o bolo foi a tia Rosa; quero divulgar a loja da minha irmã"
        />
        <p className="hint">Em branco, o Claude escreve {what} diferentes com o mesmo contexto.</p>
      </div>
      <details className="context-editor">
        <summary>Ver e editar o contexto que o Claude recebeu</summary>
        <textarea
          aria-label="Contexto que o Claude recebeu"
          rows={4}
          value={edited}
          onChange={(e) => setEdited(e.target.value)}
          placeholder="Nenhum contexto informado"
        />
      </details>
      <div className="actions">
        <button
          type="button"
          className="btn secondary"
          onClick={() => (changed ? onRegenerate(edited, update.trim()) : onMore())}
        >
          <RefreshCw size={16} aria-hidden="true" /> Gerar de novo
        </button>
      </div>
    </section>
  );
}
