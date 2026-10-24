import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cleanHandle, EMOJI_LABELS, GOAL_LABELS, LANGUAGE_LABELS, type Prefs, TONE_LABELS } from "../brief";
import { metaSummary, type Photo } from "../photos";
import type { EmojiLevel } from "../types";
import { Chips, Segmented, Toggle } from "./parts";
import { PhotoStrip } from "./PhotoStrip";

export function BriefPanel({
  photos,
  onAdd,
  onMove,
  onRemove,
  context,
  setContext,
  prefs,
  setPrefs,
  useMeta,
  setUseMeta,
  notice,
  onSubmit,
}: {
  photos: Photo[];
  onAdd: (files: File[]) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  context: string;
  setContext: (s: string) => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  useMeta: boolean;
  setUseMeta: (v: boolean) => void;
  /** Aviso sobre o acesso ao Claude (sem chave, sem permissão...). */
  notice?: ReactNode;
  onSubmit: () => void;
}) {
  const meta = metaSummary(photos);
  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs({ ...prefs, [key]: value });
  const metaLabel =
    meta.dated && meta.located ? "a data e o local" : meta.located ? "o local" : "a data";

  return (
    <form
      className="panel-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h2>Fotos e contexto</h2>
      <p className="lead">
        Envie as fotos e conte o que está acontecendo. Quanto mais detalhes, mais a legenda soa como você.
      </p>

      <PhotoStrip photos={photos} onAdd={onAdd} onMove={onMove} onRemove={onRemove} />
      {(meta.dated > 0 || meta.located > 0) && (
        <Toggle
          checked={useMeta}
          onChange={setUseMeta}
          label={
            <>
              Usar {metaLabel} gravados nas fotos <small>(ajudam a sugerir a localização)</small>
            </>
          }
        />
      )}

      <div className="field">
        <label className="label" htmlFor="pp-context">
          O que está acontecendo
        </label>
        <textarea
          id="pp-context"
          rows={4}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ex.: Aniversário de 5 anos da Ana, na casa da avó em Campinas. A festa teve tema de dinossauros e foi ela que escolheu o bolo."
        />
      </div>

      <div className="field-row">
        <div className="field grow">
          <label className="label" htmlFor="pp-profile">
            Sobre o perfil
          </label>
          <input
            id="pp-profile"
            value={prefs.profile}
            onChange={(e) => update("profile", e.target.value)}
            placeholder="Ex.: perfil pessoal, para amigos e família"
          />
        </div>
        <div className="field handle">
          <label className="label" htmlFor="pp-handle">
            Seu @, para a prévia
          </label>
          <input
            id="pp-handle"
            value={prefs.handle}
            onChange={(e) => update("handle", cleanHandle(e.target.value))}
            placeholder="seu_perfil"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      <Chips label="Objetivo" options={GOAL_LABELS} value={prefs.goal} onChange={(v) => update("goal", v)} />
      <Chips label="Tom" options={TONE_LABELS} value={prefs.tone} onChange={(v) => update("tone", v)} />
      <Chips label="Idioma" options={LANGUAGE_LABELS} value={prefs.language} onChange={(v) => update("language", v)} />
      <Segmented<EmojiLevel>
        label="Emojis"
        options={(Object.keys(EMOJI_LABELS) as EmojiLevel[]).map((id) => ({ id, label: EMOJI_LABELS[id] }))}
        value={prefs.emojis}
        onChange={(v) => update("emojis", v)}
      />
      <p className="hint">O perfil, o @ e as preferências ficam guardados neste aparelho para os próximos posts.</p>

      {notice}

      <div className="actions">
        <button type="submit" className="btn primary big" disabled={!photos.length}>
          <Sparkles size={18} aria-hidden="true" /> Sugerir legendas
        </button>
        {!photos.length && <span className="hint">Envie pelo menos uma foto.</span>}
      </div>
    </form>
  );
}
