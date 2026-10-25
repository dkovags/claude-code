import { Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import {
  cleanHandle, DESTINATION_LABELS, EMOJI_LABELS, GOAL_LABELS, LANGUAGE_LABELS, type Prefs, STORY_LENGTH_LABELS,
  TONE_LABELS,
} from "../brief";
import { STORY_WORDS } from "../caption";
import { metaSummary, type Photo } from "../photos";
import { DEFAULT_FRAMING, formatSpec } from "../render";
import type { Destination, EmojiLevel, StoryLength } from "../types";
import { Chips, Segmented, Toggle } from "./parts";
import { PhotoStrip } from "./PhotoStrip";
import { andList, photoSharpness } from "./Sharpness";

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
  // fotos pequenas demais para o formato: avisa já, porque a original costuma estar na galeria
  const stories = prefs.destination === "stories";
  const spec = formatSpec(stories ? "9:16" : "4:5");
  const small = photos.flatMap((p, i) => (photoSharpness(p, spec, DEFAULT_FRAMING).level === "blurry" ? [i + 1] : []));
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
        Envie as fotos e, se quiser, conte o que está acontecendo: quanto mais detalhes, mais o texto soa como você. Só
        as fotos são obrigatórias.
      </p>

      <Segmented<Destination>
        label="Onde vai postar"
        options={(Object.keys(DESTINATION_LABELS) as Destination[]).map((id) => ({ id, label: DESTINATION_LABELS[id] }))}
        value={prefs.destination}
        onChange={onDestination}
      />
      <p className="hint destination-hint">
        {prefs.destination === "stories"
          ? "Stories: o texto vai escrito na foto, em tela cheia (9:16), e o Claude sugere música, localização e figurinhas (enquete, perguntas e quiz só se você pedir)."
          : "Feed: o Claude escreve a legenda, com as hashtags ocultas no primeiro comentário, e a foto sai no formato do feed."}
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
      {small.length > 0 && (
        <p className="quality-note blurry" role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            {photos.length === 1
              ? "A foto tem"
              : small.length === 1
                ? `A foto ${small[0]} tem`
                : `As fotos ${andList(small)} têm`}{" "}
            pouca resolução e {small.length > 1 ? "podem" : "pode"} ficar {small.length > 1 ? "borradas" : "borrada"}{" "}
            {stories ? "no story" : "no post"}. Se tiver, use a original, e não a recebida por mensagem. Na etapa final,
            dá para ver e ajustar o enquadramento.
          </span>
        </p>
      )}
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
          O que está acontecendo (opcional)
        </label>
        <textarea
          id="pp-context"
          rows={4}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ex.: Aniversário de 5 anos da Ana, na casa da avó em Campinas. A festa teve tema de dinossauros e foi ela que escolheu o bolo."
        />
        <p className="hint">
          Sem contexto, o Claude escreve a partir das fotos e talvez faça perguntas rápidas, que dá para pular.
        </p>
      </div>

      <div className="field-row">
        <div className="field grow">
          <label className="label" htmlFor="pp-profile">
            Sobre o perfil (opcional)
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
      {prefs.destination === "stories" && (
        <div className="field">
          <Segmented<StoryLength>
            label="Tamanho do texto nas fotos"
            options={(Object.keys(STORY_LENGTH_LABELS) as StoryLength[]).map((id) => ({
              id,
              label: STORY_LENGTH_LABELS[id],
            }))}
            value={prefs.storyLength}
            onChange={(v) => update("storyLength", v)}
          />
          <p className="hint">
            {prefs.storyLength === "long"
              ? `Até ${STORY_WORDS.long.max} palavras por tela, para contar mais. Quem assiste pode segurar a tela para ler; quanto mais texto, menor a letra.`
              : `Até ${STORY_WORDS.short.max} palavras por tela, para ler num relance: cada tela fica uns 5 segundos.`}
          </p>
        </div>
      )}
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
