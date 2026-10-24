import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { CAPTION_LIMIT, charCount, fullCaption, MAX_HASHTAGS } from "../caption";
import { REFINE_PRESETS } from "../prompts";
import type { Draft, Suggestions } from "../types";
import { MarkerCircle, RefineBox, TagEditor } from "./parts";
import { Seen } from "./QuestionsPanel";

/** Texto da legenda com a primeira linha (o gancho que aparece no feed) em destaque. */
function CaptionText({ text }: { text: string }) {
  const [first, ...rest] = text.split("\n");
  return (
    <p className="caption-text">
      <strong>{first}</strong>
      {rest.length > 0 && `\n${rest.join("\n")}`}
    </p>
  );
}

/** Feed: escolher e ajustar a legenda. */
export function CaptionsPanel({
  result,
  chosen,
  onChoose,
  draft,
  setDraft,
  onRefine,
  canUndo,
  onUndo,
  onMore,
  onConfirm,
  onBack,
}: {
  result: Suggestions;
  chosen: number | null;
  onChoose: (i: number) => void;
  draft: Draft;
  setDraft: (d: Draft) => void;
  /** Pede um ajuste ao Claude; true se deu certo. */
  onRefine: (instruction: string) => Promise<boolean>;
  canUndo: boolean;
  onUndo: () => void;
  onMore: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const editor = useRef<HTMLElement>(null);
  const count = charCount(fullCaption(draft));

  useEffect(() => {
    if (chosen !== null) editor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chosen]);

  return (
    <div className="panel-body">
      <h2>Escolha a legenda</h2>
      <Seen text={result.analysis} />

      <ol className="options">
        {result.captions.map((c, i) => (
          <li key={i} className={`option${chosen === i ? " chosen" : ""}`}>
            <div className="option-head">
              <span className="option-no">
                {i + 1}
                {chosen === i && <MarkerCircle />}
              </span>
              <span className="option-style">{c.style}</span>
            </div>
            <CaptionText text={c.text} />
            {c.hashtags.length > 0 && <p className="tags">{c.hashtags.join(" ")}</p>}
            {c.why && (
              <p className="why">
                <span className="label">Por que funciona</span> {c.why}
              </p>
            )}
            <button
              type="button"
              className={`btn ${chosen === i ? "secondary" : "primary"}`}
              aria-pressed={chosen === i}
              onClick={() => onChoose(i)}
            >
              {chosen === i ? (
                <>
                  <Check size={16} aria-hidden="true" /> Escolhida
                </>
              ) : (
                "Usar esta"
              )}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn ghost" onClick={onMore}>
        <RefreshCw size={16} aria-hidden="true" /> Gerar outras opções
      </button>

      {chosen !== null && (
        <section className="editor" ref={editor} aria-labelledby="pp-editor-title">
          <h3 id="pp-editor-title">Ajuste a legenda escolhida</h3>
          <div className="field">
            <label className="label" htmlFor="pp-draft">
              Texto
            </label>
            <textarea
              id="pp-draft"
              rows={9}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <p className={`counter${count > CAPTION_LIMIT ? " over" : ""}`}>
              {count.toLocaleString("pt-BR")} de {CAPTION_LIMIT.toLocaleString("pt-BR")} caracteres, com as hashtags
            </p>
          </div>

          <div className="field">
            <span className="label">
              Hashtags ({draft.hashtags.length} de {MAX_HASHTAGS})
            </span>
            <TagEditor tags={draft.hashtags} max={MAX_HASHTAGS} onChange={(hashtags) => setDraft({ ...draft, hashtags })} />
            <p className="hint">O Instagram aceita até {MAX_HASHTAGS} hashtags por post.</p>
          </div>

          <RefineBox
            presets={REFINE_PRESETS}
            onRefine={onRefine}
            canUndo={canUndo}
            onUndo={onUndo}
            placeholder="Ou peça do seu jeito. Ex.: cite a vó Lúcia"
          />
        </section>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn primary big"
          disabled={chosen === null || !draft.text.trim() || count > CAPTION_LIMIT}
          onClick={onConfirm}
        >
          <Check size={18} aria-hidden="true" /> Confirmar legenda
        </button>
        <button type="button" className="btn ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar
        </button>
        {chosen === null && <span className="hint">Escolha uma das opções para continuar.</span>}
        {count > CAPTION_LIMIT && <span className="hint warn">A legenda passou do limite do Instagram.</span>}
      </div>
    </div>
  );
}
