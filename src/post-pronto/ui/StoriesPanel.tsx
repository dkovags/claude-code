import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { bothParts, STICKER_LABELS, STORY_WORDS, stickerSummary, wordCount } from "../caption";
import type { Photo } from "../photos";
import { STORY_REFINE_PRESETS } from "../prompts";
import type { Sticker, StickerKind, StoryFrame, StoryLength, Suggestions } from "../types";
import { MarkerCircle, OptionsInput, RefineBox, TagEditor } from "./parts";
import { Seen } from "./QuestionsPanel";
import { RegenerateBox } from "./Regenerate";

const STICKER_PLACEHOLDERS: Record<StickerKind, string> = {
  poll: "Pergunta da enquete",
  question: "Ex.: Me conta o seu tema de festa preferido",
  quiz: "Pergunta do quiz",
  slider: "Ex.: Quanto você ama bolo?",
  countdown: "Nome do evento",
  link: "Texto do botão",
  "add-yours": "Ex.: Mostre a sua festa de criança",
};

/** Figurinha de uma tela: tipo, texto e, conforme o tipo, as opções ou o emoji. */
function StickerEditor({
  id,
  sticker,
  onChange,
}: {
  id: string;
  sticker: Sticker | null;
  onChange: (s: Sticker | null) => void;
}) {
  const choose = (kind: StickerKind | "") => {
    if (!kind) return onChange(null);
    const options =
      kind === "poll" || kind === "quiz"
        ? sticker && sticker.options.length >= 2 && (sticker.kind === "poll" || sticker.kind === "quiz")
          ? sticker.options
          : ["Sim", "Não"]
        : kind === "slider"
          ? ["😍"]
          : [];
    onChange({ kind, text: sticker?.text ?? "", options });
  };
  return (
    <div className="sticker-editor">
      <label className="label" htmlFor={`${id}-kind`}>
        Figurinha (você adiciona no Instagram)
      </label>
      <div className="sticker-fields">
        <select
          id={`${id}-kind`}
          value={sticker?.kind ?? ""}
          onChange={(e) => choose(e.target.value as StickerKind | "")}
        >
          <option value="">Sem figurinha</option>
          {(Object.keys(STICKER_LABELS) as StickerKind[]).map((k) => (
            <option key={k} value={k}>
              {STICKER_LABELS[k]}
            </option>
          ))}
        </select>
        {sticker && (
          <input
            aria-label={`Texto da figurinha (${STICKER_LABELS[sticker.kind]})`}
            value={sticker.text}
            placeholder={STICKER_PLACEHOLDERS[sticker.kind]}
            onChange={(e) => onChange({ ...sticker, text: e.target.value })}
          />
        )}
      </div>
      {sticker && (sticker.kind === "poll" || sticker.kind === "quiz") && (
        <div className="field">
          <label className="label" htmlFor={`${id}-options`}>
            {sticker.kind === "quiz"
              ? "Opções, separadas por barra (a primeira é a certa)"
              : "Opções, separadas por barra"}
          </label>
          <OptionsInput
            id={`${id}-options`}
            options={sticker.options}
            placeholder="Opção 1 / Opção 2"
            onChange={(options) => onChange({ ...sticker, options })}
          />
        </div>
      )}
      {sticker?.kind === "slider" && (
        <div className="field">
          <label className="label" htmlFor={`${id}-emoji`}>
            Emoji do slider
          </label>
          <input
            id={`${id}-emoji`}
            className="emoji-input"
            value={sticker.options[0] ?? ""}
            onChange={(e) => onChange({ ...sticker, options: [e.target.value] })}
          />
        </div>
      )}
    </div>
  );
}

/** Stories: escolher a versão da sequência e ajustar o texto (e a figurinha) de cada tela. */
export function StoriesPanel({
  result,
  photos,
  chosen,
  onChoose,
  frames,
  setFrames,
  hashtags,
  setHashtags,
  storyLength,
  twoParts,
  onRefine,
  canUndo,
  onUndo,
  context,
  onRegenerate,
  onMore,
  onConfirm,
  onBack,
}: {
  result: Suggestions;
  photos: Photo[];
  chosen: number | null;
  onChoose: (i: number) => void;
  frames: StoryFrame[];
  setFrames: (f: StoryFrame[]) => void;
  hashtags: string[];
  setHashtags: (h: string[]) => void;
  /** Tamanho escolhido para os textos (decide a partir de quantas palavras o contador avisa). */
  storyLength: StoryLength;
  /** Texto de cada tela em dois trechos, com fontes diferentes (ligado na etapa final). */
  twoParts: boolean;
  /** Pede um ajuste ao Claude; true se deu certo. */
  onRefine: (instruction: string) => Promise<boolean>;
  canUndo: boolean;
  onUndo: () => void;
  /** Contexto que o Claude recebeu, para editar e gerar de novo. */
  context: string;
  onRegenerate: (context: string, update: string) => void;
  onMore: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const editor = useRef<HTMLElement>(null);
  const several = photos.length > 1;
  const maxWords = STORY_WORDS[storyLength].max;
  const update = (j: number, patch: Partial<StoryFrame>) =>
    setFrames(frames.map((f, k) => (k === j ? { ...f, ...patch } : f)));

  useEffect(() => {
    if (chosen !== null) editor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chosen]);

  return (
    <div className="panel-body">
      <h2>Escolha os textos dos stories</h2>
      <Seen text={result.analysis} />
      <p className="lead">
        O texto vai escrito na foto{several ? ", uma tela por foto" : ""}. As figurinhas sugeridas você adiciona no
        Instagram, no fim.
      </p>

      <ol className="options">
        {result.stories.map((v, i) => (
          <li key={i} className={`option${chosen === i ? " chosen" : ""}`}>
            <div className="option-head">
              <span className="option-no">
                {i + 1}
                {chosen === i && <MarkerCircle />}
              </span>
              <span className="option-style">{v.style}</span>
            </div>
            <ol className="story-frames">
              {v.frames.map((f, j) => (
                <li key={j} className="story-frame">
                  {photos[j] && <img className="story-thumb" src={photos[j].url} alt="" />}
                  <div className="story-frame-body">
                    {several && <span className="label">Tela {j + 1}</span>}
                    <p className="story-text">{f.text || <span className="muted">(sem texto)</span>}</p>
                    {f.sticker && <p className="sticker-chip">{stickerSummary(f.sticker)}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {v.why && (
              <p className="why">
                <span className="label">Por que funciona</span> {v.why}
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
                "Usar e editar"
              )}
            </button>
            {chosen === i && (
              <section className="editor" ref={editor} aria-labelledby="pp-editor-title">
                <h3 id="pp-editor-title">Ajuste os textos</h3>
                {frames.map((f, j) => {
                  const words = wordCount(bothParts(f));
                  const screen = several ? ` da tela ${j + 1}` : "";
                  return (
                    <div className="frame-editor" key={j}>
                      {photos[j] && <img className="story-thumb" src={photos[j].url} alt={`Foto ${j + 1}`} />}
                      <div className="frame-editor-body">
                        <div className="field">
                          <label className="label" htmlFor={`pp-frame-${j}`}>
                            {twoParts ? `Trecho 1${screen}` : several ? `Texto${screen}` : "Texto na foto"}
                          </label>
                          <textarea
                            id={`pp-frame-${j}`}
                            rows={2}
                            value={f.text}
                            onChange={(e) => update(j, { text: e.target.value })}
                          />
                          {twoParts && (
                            <>
                              <label className="label" htmlFor={`pp-frame2-${j}`}>
                                Trecho 2{screen} (outra fonte)
                              </label>
                              <textarea
                                id={`pp-frame2-${j}`}
                                rows={2}
                                value={f.text2 ?? ""}
                                onChange={(e) => update(j, { text2: e.target.value })}
                              />
                            </>
                          )}
                          <p className={`counter${words > maxWords ? " over" : ""}`}>
                            {words} {words === 1 ? "palavra" : "palavras"}
                            {words > maxWords &&
                              (storyLength === "long" ? " · a letra fica pequena na foto" : " · longo para ler num relance")}
                          </p>
                        </div>
                        <StickerEditor
                          id={`pp-sticker-${j}`}
                          sticker={f.sticker}
                          onChange={(sticker) => update(j, { sticker })}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="field">
                  <span className="label">Hashtags para a figurinha de hashtag (opcional)</span>
                  <TagEditor tags={hashtags} max={3} onChange={setHashtags} />
                </div>

                <RefineBox
                  presets={STORY_REFINE_PRESETS}
                  onRefine={onRefine}
                  canUndo={canUndo}
                  onUndo={onUndo}
                  placeholder="Ou peça do seu jeito. Ex.: cite a vó Lúcia na última tela"
                />
              </section>
            )}
          </li>
        ))}
      </ol>

      <RegenerateBox context={context} what="versões" onRegenerate={onRegenerate} onMore={onMore} />

      <div className="actions">
        <button
          type="button"
          className="btn primary big"
          disabled={chosen === null || frames.every((f) => !f.text.trim() && !f.sticker)}
          onClick={onConfirm}
        >
          <Check size={18} aria-hidden="true" /> Confirmar textos
        </button>
        <button type="button" className="btn ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar
        </button>
        {chosen === null && <span className="hint">Escolha uma das versões para continuar.</span>}
      </div>
    </div>
  );
}
