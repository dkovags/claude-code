import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import {
  cleanHandle, DESTINATION_LABELS, EMOJI_LABELS, GOAL_LABELS, LANGUAGE_LABELS, type Prefs, TONE_LABELS,
} from "../brief";
import { metaSummary, type Photo } from "../photos";
import type { Destination, EmojiLevel } from "../types";
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
  onDestination,
  loadingPhotos,
  uploadError,
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
  /** Trocar entre stories e feed (descarta sugestões já feitas para o outro destino). */
  onDestination: (d: Destination) => void;
  loadingPhotos: boolean;
  uploadError: string | null;
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
        Envie as fotos e conte o que está acontecendo. Quanto mais detalhes, mais o texto soa como você.
      </p>

      <Segmented<Destination>
        label="Onde vai postar"
        options={(Object.keys(DESTINATION_LABELS) as Destination[]).map((id) => ({ id, label: DESTINATION_LABELS[id] }))}
        value={prefs.destination}
        onChange={onDestination}
      />
      <p className="hint destination-hint">
        {prefs.destination === "stories"
          ? "Stories: o texto vai escrito na foto, em tela cheia (9:16), e o Claude sugere figurinhas de enquete, perguntas, música e localização."
          : "Feed: o Claude escreve a legenda com hashtags, e a foto sai no formato do feed."}
      </p>

      <PhotoStrip
        photos={photos}
        destination={prefs.destination}
        onAdd={onAdd}
        onMove={onMove}
        onRemove={onRemove}
        loading={loadingPhotos}
        error={uploadError}
      />
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
        <button type="submit" className="btn primary big" disabled={!photos.length || loadingPhotos}>
          <Sparkles size={18} aria-hidden="true" /> {prefs.destination === "stories" ? "Sugerir textos" : "Sugerir legendas"}
        </button>
        {!photos.length && <span className="hint">Envie pelo menos uma foto.</span>}
      </div>
    </form>
  );
}
