import {
  ArrowLeft, Crop, Download, ExternalLink, FileText, Images, Lightbulb, ListOrdered, MapPin, Move, Share2,
  Sticker as StickerIcon, Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fullCaption, musicLabel, postText, stickerSummary, storiesText } from "../caption";
import { fileNames, type FinishState, INITIAL_FINISH, overlaysFor } from "../finish";
import { mapsPoint, mapsSearch } from "../links";
import type { Photo } from "../photos";
import { formatTakenAt } from "../prompts";
import {
  DEFAULT_FRAMING, ensureOverlayFont, exportJpeg, FORMATS, type FormatId, formatSpec, type Framing, type Overlay,
  OVERLAY_STYLES, type OverlayStyle,
} from "../render";
import type { Saver } from "../save";
import type { Destination, Draft, PlacePick, StoryFrame, Suggestions } from "../types";
import { makeZip } from "../zip";
import { MusicSection } from "./MusicSection";
import { CopyButton, Segmented, Toggle } from "./parts";
import { PhotoStrip } from "./PhotoStrip";

function PlaceSection({
  places,
  value,
  onChange,
  photos,
  useMeta,
  stories,
}: {
  places: PlacePick[];
  value: number;
  onChange: (i: number) => void;
  photos: Photo[];
  useMeta: boolean;
  stories: boolean;
}) {
  const located = useMeta ? photos.flatMap((p, i) => (p.meta.lat !== undefined ? [{ i, ...p.meta }] : [])) : [];
  return (
    <section className="block" aria-labelledby="pp-place">
      <h3 id="pp-place">
        <MapPin size={17} aria-hidden="true" /> Localização
      </h3>
      {stories && places.length > 0 && (
        <p className="hint">No story, use a figurinha Localização e busque pelo nome.</p>
      )}
      {located.length > 0 && (
        <p className="exif-note">
          {located.map((m) => (
            <span key={m.i}>
              Foto {m.i + 1}
              {m.takenAt && `, tirada em ${formatTakenAt(m.takenAt)},`} tem localização gravada:{" "}
              <a href={mapsPoint(m.lat!, m.lon!)} target="_blank" rel="noreferrer">
                ver no mapa <ExternalLink size={12} aria-hidden="true" />
              </a>
            </span>
          ))}
        </p>
      )}
      {places.length ? (
        <ul className="picks">
          {places.map((p, i) => (
            <li key={i} className={value === i ? "on" : ""}>
              <label>
                <input type="radio" name="pp-place" checked={value === i} onChange={() => onChange(i)} />
                <span>
                  <strong>{p.name}</strong>
                  {p.kind && <span className="pick-part"> · {p.kind}</span>}
                </span>
              </label>
              {p.why && <p className="pick-why">{p.why}</p>}
              <p className="pick-links">
                <a href={mapsSearch(p.name)} target="_blank" rel="noreferrer">
                  Conferir no mapa <ExternalLink size={12} aria-hidden="true" />
                </a>
                <CopyButton text={p.name} label="Copiar nome" className="btn ghost small" />
              </p>
            </li>
          ))}
          <li className={value === -1 ? "on" : ""}>
            <label>
              <input type="radio" name="pp-place" checked={value === -1} onChange={() => onChange(-1)} />
              <span>Sem localização</span>
            </label>
          </li>
        </ul>
      ) : (
        <p className="hint">O Claude não sugeriu lugares desta vez.</p>
      )}
    </section>
  );
}

/** Stories: as figurinhas interativas a adicionar em cada tela, com o texto pronto para copiar. */
function StickersSection({ frames, hashtags }: { frames: StoryFrame[]; hashtags: string[] }) {
  const withSticker = frames.flatMap((f, i) => (f.sticker ? [{ i, sticker: f.sticker }] : []));
  if (!withSticker.length && !hashtags.length) return null;
  const several = frames.length > 1;
  return (
    <section className="block" aria-labelledby="pp-stickers">
      <h3 id="pp-stickers">
        <StickerIcon size={17} aria-hidden="true" /> Figurinhas para adicionar no Instagram
      </h3>
      <p className="hint">
        Elas geram as respostas e os votos, mas só funcionam adicionadas no próprio Instagram: no story, toque no ícone de
        figurinhas e escolha a figurinha indicada.
      </p>
      <ul className="picks stickers">
        {withSticker.map(({ i, sticker }) => (
          <li key={i}>
            <p className="pick-main">
              {several && <span className="label">Tela {i + 1}</span>}
              {stickerSummary(sticker)}
            </p>
            <p className="pick-links">
              <CopyButton text={sticker.text} label="Copiar pergunta" className="btn ghost small" />
              {sticker.options.length > 1 && (
                <CopyButton text={sticker.options.join("\n")} label="Copiar opções" className="btn ghost small" />
              )}
            </p>
          </li>
        ))}
        {hashtags.length > 0 && (
          <li>
            <p className="pick-main">Hashtag: {hashtags.join(" ")}</p>
            <p className="pick-links">
              <CopyButton text={hashtags.join(" ")} label="Copiar hashtags" className="btn ghost small" />
            </p>
          </li>
        )}
      </ul>
    </section>
  );
}

export function FinishPanel({
  destination,
  photos,
  active,
  setActive,
  finish,
  setFinish,
  setFraming,
  result,
  draft,
  frames,
  setFrames,
  storyTags,
  useMeta,
  saver,
  notify,
  onBack,
  onReset,
}: {
  destination: Destination;
  photos: Photo[];
  active: number;
  setActive: (i: number) => void;
  finish: FinishState;
  setFinish: (f: FinishState) => void;
  setFraming: (index: number, f: Framing) => void;
  result: Suggestions;
  /** Feed: a legenda escolhida. */
  draft: Draft;
  /** Stories: o texto e a figurinha de cada tela. */
  frames: StoryFrame[];
  setFrames: (f: StoryFrame[]) => void;
  storyTags: string[];
  useMeta: boolean;
  saver: Saver | null;
  notify: (message: string) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [prepared, setPrepared] = useState<File[] | null>(null);
  const stories = destination === "stories";
  const spec = formatSpec(stories ? "9:16" : finish.format);
  const photo = photos[Math.min(active, photos.length - 1)];
  const { overlayOn, overlay } = finish;
  const overlays = useMemo(
    () => overlaysFor(destination, photos.length, { ...INITIAL_FINISH, overlayOn, overlay }, frames),
    [destination, photos.length, overlayOn, overlay, frames],
  );
  const names = fileNames(destination, photos.length);
  const music = result.music[finish.music];
  const place = result.places[finish.place];
  const caption = fullCaption(draft);
  const several = photos.length > 1;
  const set = (patch: Partial<FinishState>) => setFinish({ ...finish, ...patch });
  const setOverlay = (patch: Partial<Overlay>) => set({ overlay: { ...finish.overlay, ...patch } });
  const frameText = (i: number, text: string) =>
    setFrames(photos.map((_, k) => (k === i ? { ...(frames[k] ?? { sticker: null }), text } : (frames[k] ?? { text: "", sticker: null }))));
  const textFile = () =>
    stories
      ? storiesText({ frames: photos.map((_, i) => frames[i] ?? { text: "", sticker: null }), hashtags: storyTags, music, place })
      : postText({ draft, music, place, altText: finish.altText });

  // Fotos finais prontas de antemão: o menu de compartilhar do celular precisa abrir logo após o toque
  useEffect(() => {
    let alive = true;
    setPrepared(null);
    const t = setTimeout(async () => {
      await Promise.all(overlays.map((o) => (o ? ensureOverlayFont(o.style) : null)));
      const photoName = fileNames(destination, photos.length).photo;
      const files = await Promise.all(
        photos.map(async (p, i) => {
          const blob = await exportJpeg(p.img, p.width, p.height, spec, p.framing, overlays[i]);
          return new File([blob], photoName(i), { type: "image/jpeg" });
        }),
      );
      if (alive) setPrepared(files);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [destination, photos, spec, overlays]);

  async function deliver(kind: "photos" | "text" | "all") {
    if (!saver || (kind !== "text" && !prepared)) return;
    setSaving(kind);
    try {
      let name: string;
      let data: Blob;
      if (kind === "text") {
        name = names.text;
        data = new Blob([textFile()], { type: "text/plain;charset=utf-8" });
      } else if (kind === "photos" && prepared!.length === 1) {
        name = prepared![0].name;
        data = prepared![0];
      } else {
        const entries = await Promise.all(
          prepared!.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
        );
        if (kind === "all") entries.push({ name: names.text, data: new TextEncoder().encode(textFile()) });
        name = kind === "all" ? names.allZip : names.photosZip;
        data = new Blob([makeZip(entries)], { type: "application/zip" });
      }
      const outcome = await saver.save(name, data);
      if (outcome === "saved") notify(kind === "text" ? "Textos baixados." : "Download pronto.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível baixar.");
    } finally {
      setSaving(null);
    }
  }

  async function share() {
    if (!saver?.share || !prepared) return;
    try {
      await saver.share(prepared);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Não foi possível compartilhar.");
    }
  }

  const photosLabel = stories
    ? several
      ? `Baixar as ${photos.length} telas (.zip)`
      : "Baixar a foto"
    : several
      ? `Baixar as ${photos.length} fotos (.zip)`
      : "Baixar a foto";
  const copiedMsg = (ok: boolean) => notify(ok ? "Legenda copiada." : "Não deu para copiar. Selecione o texto e copie.");

  return (
    <div className="panel-body">
      <h2>{stories ? "Pronto para os stories" : "Pronto para postar"}</h2>
      <p className="lead">
        {stories
          ? `Baixe ${several ? `as ${photos.length} telas` : "a foto"} já em 9:16, com o texto escrito na foto. Figurinhas, música e localização você adiciona no Instagram, como mostra a lista abaixo.`
          : `Baixe ${several ? `as ${photos.length} fotos` : "a foto"} já no formato do Instagram e copie a legenda. Se quiser, ajuste o enquadramento ou escreva um texto na capa logo abaixo.`}
      </p>

      <section className="block deliver" aria-labelledby="pp-deliver">
        <h3 id="pp-deliver" className="sr-only">
          Baixar
        </h3>
        {saver ? (
          <div className="actions">
            <button
              type="button"
              className="btn primary big"
              disabled={!prepared || saving !== null}
              onClick={() => deliver("photos")}
            >
              {several ? <Images size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
              {prepared ? photosLabel : "Preparando…"}
            </button>
            {!stories && <CopyButton text={caption} label="Copiar legenda" onResult={copiedMsg} />}
            {saver.share && (
              <button type="button" className="btn secondary" disabled={!prepared} onClick={share}>
                <Share2 size={16} aria-hidden="true" /> {stories ? "Abrir no Instagram" : "Compartilhar"}
              </button>
            )}
          </div>
        ) : (
          <div className="actions">
            {!stories && <CopyButton text={caption} label="Copiar legenda" className="btn primary big" onResult={copiedMsg} />}
            <p className="hint">Esta tela não permite baixar arquivos. Abra o Post Pronto no navegador para baixar a foto.</p>
          </div>
        )}
        {saver && (
          <div className="actions secondary-actions">
            <button type="button" className="btn ghost small" disabled={saving !== null} onClick={() => deliver("text")}>
              <FileText size={15} aria-hidden="true" />{" "}
              {stories ? "Baixar textos, figurinhas, música e local (.txt)" : "Baixar legenda, música e local (.txt)"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              disabled={!prepared || saving !== null}
              onClick={() => deliver("all")}
            >
              <Download size={15} aria-hidden="true" /> Baixar tudo junto (.zip)
            </button>
          </div>
        )}
        {saver?.share && (
          <p className="hint">
            {stories
              ? "No celular, Abrir no Instagram leva as fotos direto para o story."
              : "Ao compartilhar, cole a legenda no Instagram: ela não vai junto com as fotos."}
          </p>
        )}
      </section>

      {stories && <StickersSection frames={frames.slice(0, photos.length)} hashtags={storyTags} />}
      <MusicSection music={result.music} value={finish.music} onChange={(i) => set({ music: i })} stories={stories} />
      <PlaceSection
        places={result.places}
        value={finish.place}
        onChange={(i) => set({ place: i })}
        photos={photos}
        useMeta={useMeta}
        stories={stories}
      />

      <section className="block" aria-labelledby="pp-overlay">
        <h3 id="pp-overlay">
          <Type size={17} aria-hidden="true" /> {stories ? "Texto nas fotos" : "Texto na foto"}
        </h3>
        <Toggle
          checked={finish.overlayOn}
          onChange={(overlayOn) => set({ overlayOn })}
          label={stories ? "Escrever os textos nas fotos" : "Escrever um texto na capa"}
        />
        {stories && (
          <div className="field">
            <label className="label" htmlFor="pp-frame-text">
              {several ? `Texto da tela ${active + 1}` : "Texto"}
            </label>
            <textarea
              id="pp-frame-text"
              rows={2}
              value={frames[active]?.text ?? ""}
              onChange={(e) => frameText(active, e.target.value)}
            />
            {!finish.overlayOn && (
              <div className="actions">
                <CopyButton text={frames[active]?.text ?? ""} label="Copiar texto" className="btn ghost small" />
                <span className="hint">Sem o texto na foto, escreva no story com o botão Aa.</span>
              </div>
            )}
          </div>
        )}
        {!stories && finish.overlayOn && (
          <>
            <div className="field">
              <label className="label" htmlFor="pp-overlay-text">
                Texto
              </label>
              <textarea
                id="pp-overlay-text"
                rows={2}
                value={finish.overlay.text}
                onChange={(e) => setOverlay({ text: e.target.value })}
                placeholder="Uma frase curta"
              />
            </div>
            {result.overlays.length > 0 && (
              <div className="chips" aria-label="Sugestões do Claude">
                {result.overlays.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip${finish.overlay.text === t ? " on" : ""}`}
                    onClick={() => setOverlay({ text: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {finish.overlayOn && (
          <>
            <Segmented<OverlayStyle>
              label="Estilo"
              options={(Object.keys(OVERLAY_STYLES) as OverlayStyle[]).map((id) => ({
                id,
                label: (
                  <span
                    style={{
                      fontFamily: OVERLAY_STYLES[id].family,
                      fontWeight: OVERLAY_STYLES[id].weight,
                      fontStyle: OVERLAY_STYLES[id].italic ? "italic" : "normal",
                    }}
                  >
                    {OVERLAY_STYLES[id].label}
                  </span>
                ),
              }))}
              value={finish.overlay.style}
              onChange={(style) => setOverlay({ style })}
            />
            <div className="field-row">
              <Segmented<Overlay["position"]>
                label="Posição"
                options={[
                  { id: "top", label: "Em cima" },
                  { id: "center", label: "No meio" },
                  { id: "bottom", label: "Embaixo" },
                ]}
                value={finish.overlay.position}
                onChange={(position) => setOverlay({ position })}
              />
              <Segmented<Overlay["color"]>
                label="Cor"
                options={[
                  { id: "light", label: "Branco" },
                  { id: "dark", label: "Preto" },
                ]}
                value={finish.overlay.color}
                onChange={(color) => setOverlay({ color })}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="pp-overlay-size">
                Tamanho
              </label>
              <input
                id="pp-overlay-size"
                type="range"
                min={0.6}
                max={1.6}
                step={0.05}
                value={finish.overlay.size}
                onChange={(e) => setOverlay({ size: Number(e.target.value) })}
              />
            </div>
            <Toggle checked={finish.overlay.band} onChange={(band) => setOverlay({ band })} label="Faixa atrás do texto" />
            <p className="hint">
              {stories
                ? "O mesmo estilo vale para todas as telas. Em cima e embaixo ficam livres as áreas cobertas pelos botões do story."
                : several
                  ? "O texto vai só na capa (foto 1)."
                  : ""}
            </p>
          </>
        )}
      </section>

      <section className="block" aria-labelledby="pp-photo">
        <h3 id="pp-photo">
          <Crop size={17} aria-hidden="true" /> Foto
        </h3>
        {stories ? (
          <p className="hint">Formato dos stories: 9:16, em 1080 × 1920 pixels.</p>
        ) : (
          <>
            <Segmented<FormatId>
              label="Formato"
              options={FORMATS.map((f) => ({
                id: f.id,
                title: f.hint,
                label: (
                  <>
                    <span className="ratio" style={{ aspectRatio: `${f.w} / ${f.h}` }} aria-hidden="true" />
                    {f.label}
                  </>
                ),
              }))}
              value={finish.format}
              onChange={(format) => set({ format })}
            />
            <p className="hint">
              {spec.hint}. {several && "No carrossel, todas as fotos usam o mesmo formato."}
            </p>
          </>
        )}
        {several && (
          <div className="field">
            <span className="label">{stories ? "Tela que você está ajustando" : "Foto que você está ajustando"}</span>
            <PhotoStrip photos={photos} destination={destination} active={active} onActive={setActive} />
          </div>
        )}
        <Segmented<Framing["mode"]>
          label="Enquadramento"
          options={[
            { id: "fill", label: "Preencher a tela" },
            { id: "fit", label: "Foto inteira" },
          ]}
          value={photo.framing.mode}
          onChange={(mode) => setFraming(active, { ...photo.framing, mode })}
        />
        {photo.framing.mode === "fill" ? (
          <>
            <div className="field">
              <label className="label" htmlFor="pp-zoom">
                Zoom
              </label>
              <input
                id="pp-zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={photo.framing.zoom}
                onChange={(e) => setFraming(active, { ...photo.framing, zoom: Number(e.target.value) })}
              />
            </div>
            <p className="hint with-icon">
              <Move size={15} aria-hidden="true" /> Arraste a foto na prévia (ou use as setas do teclado) para escolher o
              enquadramento.
            </p>
            <button type="button" className="btn ghost small" onClick={() => setFraming(active, { ...DEFAULT_FRAMING })}>
              Centralizar de novo
            </button>
          </>
        ) : (
          <p className="hint">A foto aparece inteira, e o espaço que sobra é preenchido com ela mesma, desfocada.</p>
        )}
      </section>

      {!stories && (
        <section className="block" aria-labelledby="pp-alt">
          <h3 id="pp-alt">Texto alternativo</h3>
          <p className="hint">Descreve a foto para quem usa leitor de tela. Também ajuda o Instagram a entender o post.</p>
          <textarea aria-labelledby="pp-alt" rows={3} value={finish.altText} onChange={(e) => set({ altText: e.target.value })} />
          <CopyButton text={finish.altText} label="Copiar texto alternativo" className="btn ghost small" />
        </section>
      )}

      {result.tips.length > 0 && (
        <section className="block" aria-labelledby="pp-tips">
          <h3 id="pp-tips">
            <Lightbulb size={17} aria-hidden="true" /> Dicas do Claude
          </h3>
          <ul className="tips">
            {result.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="block" aria-labelledby="pp-how">
        <h3 id="pp-how">
          <ListOrdered size={17} aria-hidden="true" /> Como publicar
        </h3>
        {stories ? (
          <ol className="how">
            <li>
              No Instagram, toque em <b>+</b> e escolha <b>Story</b> (ou deslize o feed para a direita).
            </li>
            <li>
              {several
                ? `Toque em Selecionar e escolha as ${photos.length} fotos baixadas, na ordem dos números.`
                : "Escolha a foto baixada."}
            </li>
            {frames.slice(0, photos.length).map((f, i) =>
              f.sticker ? (
                <li key={i}>
                  {several ? `Na tela ${i + 1}, toque` : "Toque"} no ícone de figurinhas e adicione{" "}
                  <b>{stickerSummary(f.sticker)}</b>.
                </li>
              ) : null,
            )}
            {music && (
              <li>
                Adicione a figurinha <b>Música</b>, busque “{musicLabel(music)}” e escolha o trecho
                {music.part ? ` (${music.part})` : ""}.
              </li>
            )}
            {place && (
              <li>
                Adicione a figurinha <b>Localização</b> e busque “{place.name}”.
              </li>
            )}
            {!finish.overlayOn && <li>Escreva o texto de cada tela com o botão Aa.</li>}
            <li>Publique em Seu story e responda às mensagens e às respostas das figurinhas.</li>
          </ol>
        ) : (
          <ol className="how">
            <li>
              No Instagram, toque em <b>+</b> e escolha <b>{finish.format === "9:16" ? "Story" : "Publicação"}</b>.
            </li>
            <li>
              {several
                ? `Selecione as ${photos.length} fotos baixadas, na ordem dos números (a 1 é a capa).`
                : "Selecione a foto baixada."}{" "}
              Ela já está no formato certo: toque no ícone de expandir para não cortar.
            </li>
            <li>Na tela da legenda, cole o texto copiado.</li>
            {music && (
              <li>
                Toque em <b>Adicionar música</b> e busque “{musicLabel(music)}”.
              </li>
            )}
            {place && (
              <li>
                Toque em <b>Adicionar localização</b> e busque “{place.name}”.
              </li>
            )}
            {finish.altText.trim() && (
              <li>
                Em <b>Configurações avançadas</b>, na parte de acessibilidade, cole o texto alternativo.
              </li>
            )}
            <li>Publique e responda aos comentários na primeira hora: isso ajuda o post a alcançar mais gente.</li>
          </ol>
        )}
      </section>

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {stories ? "Voltar para os textos" : "Voltar para a legenda"}
        </button>
        {confirmReset ? (
          <span className="confirm">
            O post atual será apagado.
            <button type="button" className="btn secondary small" onClick={onReset}>
              Apagar e começar outro
            </button>
            <button type="button" className="btn ghost small" onClick={() => setConfirmReset(false)}>
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setConfirmReset(true)}>
            Começar outro post
          </button>
        )}
      </div>
    </div>
  );
}
