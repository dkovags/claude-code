import { ArrowLeft, Check, RefreshCw, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAPTION_LIMIT, charCount, fullCaption, MAX_HASHTAGS } from "../caption";
import { cleanHashtags, REFINE_PRESETS } from "../prompts";
import type { Draft, Suggestions } from "../types";
import { MarkerCircle } from "./parts";
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
  const [custom, setCustom] = useState("");
  const [tag, setTag] = useState("");
  const editor = useRef<HTMLElement>(null);
  const count = charCount(fullCaption(draft));

  useEffect(() => {
    if (chosen !== null) editor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chosen]);

  const addTag = () => {
    if (!tag.trim()) return;
    setDraft({ ...draft, hashtags: cleanHashtags([...draft.hashtags, tag]) });
    setTag("");
  };
  const askCustom = async () => {
    if (custom.trim() && (await onRefine(custom))) setCustom("");
  };

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
            <div className="tag-editor">
              {draft.hashtags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                  <button
                    type="button"
                    aria-label={`Tirar ${t}`}
                    onClick={() => setDraft({ ...draft, hashtags: draft.hashtags.filter((x) => x !== t) })}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {draft.hashtags.length < MAX_HASHTAGS && (
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === " ") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder="#nova"
                  aria-label="Adicionar hashtag"
                  autoCapitalize="none"
                />
              )}
            </div>
            <p className="hint">O Instagram aceita até {MAX_HASHTAGS} hashtags por post.</p>
          </div>

          <div className="field">
            <span className="label">Pedir um ajuste ao Claude</span>
            <div className="chips">
              {REFINE_PRESETS.map((p) => (
                <button key={p.label} type="button" className="chip" onClick={() => onRefine(p.instruction)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="inline-form">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    askCustom();
                  }
                }}
                placeholder="Ou peça do seu jeito. Ex.: cite a vó Lúcia"
                aria-label="Pedido de ajuste"
              />
              <button type="button" className="btn secondary" disabled={!custom.trim()} onClick={askCustom}>
                <WandSparkles size={16} aria-hidden="true" /> Ajustar
              </button>
            </div>
            {canUndo && (
              <button type="button" className="btn ghost small" onClick={onUndo}>
                <Undo2 size={15} aria-hidden="true" /> Desfazer o último ajuste
              </button>
            )}
          </div>
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
