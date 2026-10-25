import {
  ArrowLeft, Crop, Download, ExternalLink, FileText, Hash, Images, Lightbulb, ListOrdered, MapPin, Move, Share2,
  Sticker as StickerIcon, Trash2, TriangleAlert, Type,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { bothParts, musicLabel, postText, stickerSummary, storiesText } from "../caption";
import { fileNames, type FinishState, INITIAL_FINISH, overlaysFor } from "../finish";
import { mapsPoint, mapsSearch } from "../links";
import type { Photo } from "../photos";
import { formatTakenAt } from "../prompts";
import {
  ensureOverlayFonts, exportJpeg, fitZoom, FORMATS, type FormatId, formatSpec, type FormatSpec, type Framing, MAX_ZOOM,
  minZoom, type Overlay, snapZoom,
  OVERLAY_STYLES, type OverlayStyle, sameAsBox, TEXT_BG_LABELS, TEXT_COLORS, type TextBg, type TextColor,
} from "../render";
import { mobileKind, touchScreen } from "../runtime";
import type { Saver } from "../save";
import type { Destination, Draft, PlacePick, StoryFrame, Suggestions } from "../types";
import { makeZip } from "../zip";
import { MusicSection } from "./MusicSection";
import { CopyButton, Segmented, Toggle } from "./parts";
import { PhotoStrip } from "./PhotoStrip";
import { andList, photoSharpness, SharpnessNote } from "./Sharpness";
import { useShot } from "./shot";

/**
 * Prévia pequena, no canto da tela, enquanto a pessoa ajusta o texto e a foto no celular: lá a prévia grande fica no
 * alto da página, longe desses controles. No computador ela fica escondida (a prévia grande está ao lado).
 */
function MiniPreview({ photo, spec, overlay }: { photo: Photo; spec: FormatSpec; overlay: Overlay | null }) {
  const shot = useShot({ source: photo, spec, framing: photo.framing, overlay, width: 240 });
  return (
    <div className="mini-preview" aria-hidden="true" data-capture="skip">
      <canvas ref={shot.canvas} />
    </div>
  );
}

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

const BG_OPTIONS = (Object.keys(TEXT_BG_LABELS) as TextBg[]).map((id) => ({
  id,
  label: (
    <>
      <span className={`bg-swatch ${id}`} aria-hidden="true" />
      {TEXT_BG_LABELS[id]}
    </>
  ),
}));

/** As cores do texto como bolinhas para tocar, com o nome para o leitor de tela. */
function ColorSwatches({ label, value, onChange }: { label: string; value: TextColor; onChange: (c: TextColor) => void }) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      <div className="swatches">
        {(Object.keys(TEXT_COLORS) as TextColor[]).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            aria-label={TEXT_COLORS[id].label}
            title={TEXT_COLORS[id].label}
            className={`swatch${value === id ? " on" : ""}`}
            style={{ background: TEXT_COLORS[id].hex }}
            onClick={() => onChange(id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Fonte, fundo, cor e tamanho do título (`part` 1) ou da explicação (`part` 2); sem `part`, do texto todo. */
function PartControls({
  part,
  style,
  bg,
  color,
  size,
  styleOptions,
  onStyle,
  onBg,
  onColor,
  onSize,
}: {
  part?: 1 | 2;
  style: OverlayStyle;
  bg: TextBg;
  color: TextColor;
  size: number;
  styleOptions: { id: OverlayStyle; label: ReactNode }[];
  onStyle: (s: OverlayStyle) => void;
  onBg: (b: TextBg) => void;
  onColor: (c: TextColor) => void;
  onSize: (n: number) => void;
}) {
  const of = part === 1 ? " do título" : part === 2 ? " da explicação" : "";
  const sizeId = part === 2 ? "pp-overlay-size2" : "pp-overlay-size";
  return (
    <div className={part ? "part-controls" : "part-controls single"}>
      <Segmented<OverlayStyle>
        label={part ? `Fonte${of}` : "Estilo"}
        options={styleOptions}
        narrowColumns={2}
        value={style}
        onChange={onStyle}
      />
      <Segmented<TextBg> label={`Fundo${of}`} options={BG_OPTIONS} narrowColumns={2} value={bg} onChange={onBg} />
      <ColorSwatches label={`Cor do texto${of}`} value={color} onChange={onColor} />
      {sameAsBox(bg, color) && (
        <p className="hint">Na caixa da mesma cor, o texto fica {bg === "white" ? "preto" : "branco"}, para não sumir.</p>
      )}
      <div className="field">
        <label className="label" htmlFor={sizeId}>
          Tamanho{of}
        </label>
        <input
          id={sizeId}
          type="range"
          min={0.6}
          max={1.6}
          step={0.05}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

/** Stories: as figurinhas interativas a adicionar em cada tela, com o texto pronto para copiar. */
function StickersSection({ frames, onRemove }: { frames: StoryFrame[]; onRemove: (index: number) => void }) {
  const withSticker = frames.flatMap((f, i) => (f.sticker ? [{ i, sticker: f.sticker }] : []));
  if (!withSticker.length) return null;
  const several = frames.length > 1;
  return (
    <section className="block" aria-labelledby="pp-stickers">
      <h3 id="pp-stickers">
        <StickerIcon size={17} aria-hidden="true" /> Figurinhas para adicionar no Instagram
      </h3>
      <p className="hint">
        Elas geram as respostas e os votos, mas só funcionam adicionadas no próprio Instagram: no story, toque no ícone de
        figurinhas e escolha a figurinha indicada. Depois, arraste a figurinha com o dedo para onde quiser e use dois
        dedos para mudar o tamanho. Na prévia, dá para arrastar a figurinha tracejada para ver onde ela fica melhor.
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
              <button
                type="button"
                className="btn ghost small"
                aria-label={several ? `Remover a figurinha da tela ${i + 1}` : "Remover a figurinha"}
                onClick={() => onRemove(i)}
              >
                <Trash2 size={14} aria-hidden="true" /> Remover
              </button>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Hashtags ocultas, fora do que as pessoas veem. Nos stories, só contam as digitadas no editor do Instagram (escrita na
 * foto, a hashtag não vira link), então a pessoa cola e esconde; no feed, elas vão no primeiro comentário.
 */
function HiddenTagsSection({ hashtags, stories }: { hashtags: string[]; stories: boolean }) {
  if (!hashtags.length) return null;
  const tags = hashtags.join(" ");
  return (
    <section className="block" aria-labelledby="pp-tags">
      <h3 id="pp-tags">
        <Hash size={17} aria-hidden="true" /> Hashtags ocultas
      </h3>
      <div className="hidden-tags">
        <p className="tags">{tags}</p>
        <CopyButton text={tags} label="Copiar hashtags" className="btn ghost small" />
      </div>
      {stories ? (
        <ol className="hide-steps">
          <li>
            No story, toque em <b>Aa</b> e cole as hashtags.
          </li>
          <li>Diminua o texto ao máximo, fazendo pinça com dois dedos.</li>
          <li>
            Arraste para um canto liso da foto, longe do texto, e pinte com a cor do fundo: na paleta de cores, o
            conta-gotas pega a cor exata. Ou arraste a figurinha de música ou de localização por cima.
          </li>
          <li>Deixe dentro da tela: hashtag arrastada para fora pode ser descartada.</li>
        </ol>
      ) : (
        <p className="hint">
          Elas ficam fora da legenda: quem vê o post no feed não as vê. Logo depois de publicar, toque no balão de
          comentário do seu post e cole as hashtags.
        </p>
      )}
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
  onTwoParts,
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
  /** Liga ou desliga título e explicação com fontes diferentes (divide ou junta os textos). */
  onTwoParts: (on: boolean) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  // no celular, depois de baixar as fotos: o caminho até o Instagram
  const [postHelp, setPostHelp] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [prepared, setPrepared] = useState<File[] | null>(null);
  const textSection = useRef<HTMLElement>(null);
  const photoSection = useRef<HTMLElement>(null);
  const [adjusting, setAdjusting] = useState(false);

  // a prévia pequena aparece enquanto os controles do texto ou da foto estão no meio da tela
  useEffect(() => {
    const sections = [textSection.current, photoSection.current].filter((el): el is HTMLElement => !!el);
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const inView = new Set<Element>();
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inView.add(e.target);
          else inView.delete(e.target);
        }
        setAdjusting(inView.size > 0);
      },
      { rootMargin: "-25% 0px -25% 0px" },
    );
    sections.forEach((el) => watcher.observe(el));
    return () => watcher.disconnect();
  }, []);
  const stories = destination === "stories";
  const phone = touchScreen();
  const spec = formatSpec(stories ? "9:16" : finish.format);
  const photo = photos[Math.min(active, photos.length - 1)];
  // zoom da foto que está sendo ajustada: de um pouco menor que a foto inteira até 3 vezes o que preenche a tela
  const wholeZoom = fitZoom(photo.width, photo.height, spec.w, spec.h);
  const smallestZoom = minZoom(photo.width, photo.height, spec.w, spec.h);
  const zoom = Math.min(MAX_ZOOM, Math.max(smallestZoom, photo.framing.zoom));
  const framingPreset = zoom >= 0.995 ? "fill" : Math.abs(zoom - wholeZoom) < 0.005 ? "fit" : null;
  const { overlayOn, twoParts, overlay } = finish;
  // só os textos e o lugar deles entram na foto: mexer na figurinha tracejada não refaz os arquivos
  const frameTexts = frames.map((f) => JSON.stringify([f.text, f.text2 ?? "", f.textAt, f.text2At])).join("\u0001");
  const overlays = useMemo(
    () => overlaysFor(destination, photos.length, { ...INITIAL_FINISH, overlayOn, twoParts, overlay }, frames),
    [destination, photos.length, overlayOn, twoParts, overlay, frameTexts],
  );
  const names = fileNames(destination, photos.length);
  // fotos que vão perder nitidez na imagem baixada (pouca resolução para o enquadramento)
  const lowRes = photos.map((p) => photoSharpness(p, spec).level !== "ok");
  const lowResNumbers = lowRes.flatMap((low, i) => (low ? [i + 1] : []));
  const photoLabel = (i: number) => (!several ? "A foto" : stories ? `A foto da tela ${i + 1}` : `A foto ${i + 1}`);
  const music = result.music[finish.music];
  const place = result.places[finish.place];
  const caption = draft.text.trim();
  const several = photos.length > 1;
  const set = (patch: Partial<FinishState>) => setFinish({ ...finish, ...patch });
  const setOverlay = (patch: Partial<Overlay>) => set({ overlay: { ...finish.overlay, ...patch } });
  // texto arrastado na prévia (nos stories, em alguma tela; no feed, na capa)
  const moved = stories
    ? frames.some((f) => f.textAt || (twoParts && f.text2At))
    : !!(overlay.at || (twoParts && overlay.at2));
  // escolher uma posição tira o texto do lugar para onde foi arrastado
  const setPosition = (position: Overlay["position"]) => {
    setOverlay({ position, at: undefined, at2: undefined });
    if (stories && frames.some((f) => f.textAt || f.text2At)) {
      setFrames(frames.map((f) => ({ ...f, textAt: undefined, text2At: undefined })));
    }
  };
  const frameText = (i: number, patch: Pick<StoryFrame, "text"> | Pick<StoryFrame, "text2">) =>
    setFrames(photos.map((_, k) => ({ ...(frames[k] ?? { text: "", sticker: null }), ...(k === i ? patch : {}) })));
  const styleOptions = (Object.keys(OVERLAY_STYLES) as OverlayStyle[]).map((id) => ({
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
  }));
  const screen = several ? ` da tela ${active + 1}` : "";
  const textFile = () =>
    stories
      ? storiesText({ frames: photos.map((_, i) => frames[i] ?? { text: "", sticker: null }), hashtags: storyTags, music, place })
      : postText({ draft, music, place, altText: finish.altText });

  // Fotos finais prontas de antemão: o menu de compartilhar do celular precisa abrir logo após o toque
  useEffect(() => {
    let alive = true;
    setPrepared(null);
    const t = setTimeout(async () => {
      await Promise.all(overlays.map((o) => (o ? ensureOverlayFonts(o) : null)));
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
      if (kind === "photos" && (prepared!.length === 1 || phone)) {
        // no celular, uma foto de cada vez: elas ficam no aparelho para escolher no Instagram, que não abre .zip
        let saved = 0;
        for (const f of prepared!) {
          if ((await saver.save(f.name, f)) !== "saved") break;
          saved++;
        }
        if (saved) {
          notify(saved === 1 ? "Foto baixada." : `${saved} fotos baixadas.`);
          if (phone) setPostHelp(true);
        }
        return;
      }
      let name: string;
      let data: Blob;
      if (kind === "text") {
        name = names.text;
        data = new Blob([textFile()], { type: "text/plain;charset=utf-8" });
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

  // no celular, as fotos saem uma a uma; no computador, juntas num .zip
  const photosLabel = !several
    ? "Baixar a foto"
    : `Baixar as ${photos.length} ${stories ? "telas" : "fotos"}${phone ? "" : " (.zip)"}`;
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
                <Share2 size={16} aria-hidden="true" /> {phone ? "Mandar para o Instagram" : "Compartilhar"}
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
        {lowResNumbers.length > 0 && (
          <p className="quality-note soft" role="status">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>
              {!several
                ? "A foto"
                : lowResNumbers.length === 1
                  ? photoLabel(lowResNumbers[0] - 1)
                  : stories
                    ? `As fotos das telas ${andList(lowResNumbers)}`
                    : `As fotos ${andList(lowResNumbers)}`}{" "}
              {lowResNumbers.length > 1 ? "vão" : "vai"} perder nitidez na imagem baixada, porque{" "}
              {lowResNumbers.length > 1 ? "têm" : "tem"} pouca resolução para o enquadramento. Veja em Foto, logo
              abaixo, como melhorar.
            </span>
          </p>
        )}
        {postHelp && (
          <div className="post-help" role="status">
            <p>
              <b>{several ? "Fotos salvas no celular." : "Foto salva no celular."}</b> Para postar, abra o Instagram,{" "}
              {stories ? "deslize o feed para a direita (ou toque em + e escolha Story)" : "toque em + e escolha Publicação"}{" "}
              e escolha {several ? "as fotos, na ordem dos números," : "a foto"} em Recentes.
            </p>
            <div className="actions">
              <a className="btn secondary" href="https://www.instagram.com/" target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" /> Abrir o Instagram
              </a>
              <button type="button" className="btn ghost small" onClick={() => setPostHelp(false)}>
                Fechar
              </button>
            </div>
          </div>
        )}
        {saver && !saver.share && phone && (
          <p className="hint">
            {mobileKind() === "ios-app"
              ? "No app do Claude para iPhone, baixar abre o menu de compartilhar: dá para escolher o Instagram direto."
              : "Aqui, o menu de compartilhar do celular não abre. Baixe as fotos: elas ficam no celular, e é só escolher no Instagram."}
          </p>
        )}
        {saver?.share && (
          <p className="hint">
            {phone
              ? stories
                ? "Mandar para o Instagram leva as fotos direto para o story: no menu, escolha Instagram (Stories) e adicione lá as figurinhas, a música e a localização."
                : "Mandar para o Instagram leva as fotos direto para o post: no menu, escolha Instagram (Feed) e cole a legenda, que não vai junto com as fotos."
              : "Compartilhar envia as fotos para outro aplicativo, pelo menu do sistema."}
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="pp-overlay" ref={textSection}>
        <h3 id="pp-overlay">
          <Type size={17} aria-hidden="true" /> {stories ? "Texto nas fotos" : "Texto na foto"}
        </h3>
        <Toggle
          checked={finish.overlayOn}
          onChange={(overlayOn) => set({ overlayOn })}
          label={stories ? "Escrever os textos nas fotos" : "Escrever um texto na capa"}
        />
        {finish.overlayOn && (
          <Toggle checked={twoParts} onChange={onTwoParts} label="Título e explicação, com fontes diferentes" />
        )}
        {stories && (
          <div className="field">
            <label className="label" htmlFor="pp-frame-text">
              {overlayOn && twoParts ? `Título${screen}` : several ? `Texto${screen}` : "Texto"}
            </label>
            <textarea
              id="pp-frame-text"
              rows={2}
              value={frames[active]?.text ?? ""}
              onChange={(e) => frameText(active, { text: e.target.value })}
            />
            {overlayOn && twoParts && (
              <>
                <label className="label" htmlFor="pp-frame-text2">
                  Explicação{screen}
                </label>
                <textarea
                  id="pp-frame-text2"
                  rows={2}
                  value={frames[active]?.text2 ?? ""}
                  onChange={(e) => frameText(active, { text2: e.target.value })}
                  placeholder="Logo abaixo do título, com a fonte da explicação"
                />
              </>
            )}
            {!finish.overlayOn && (
              <div className="actions">
                <CopyButton
                  text={frames[active] ? bothParts(frames[active], "\n") : ""}
                  label="Copiar texto"
                  className="btn ghost small"
                />
                <span className="hint">Sem o texto na foto, escreva no story com o botão Aa.</span>
              </div>
            )}
          </div>
        )}
        {!stories && finish.overlayOn && (
          <>
            <div className="field">
              <label className="label" htmlFor="pp-overlay-text">
                {twoParts ? "Título" : "Texto"}
              </label>
              <textarea
                id="pp-overlay-text"
                rows={2}
                value={finish.overlay.text}
                onChange={(e) => setOverlay({ text: e.target.value })}
                placeholder="Uma frase curta"
              />
              {twoParts && (
                <>
                  <label className="label" htmlFor="pp-overlay-text2">
                    Explicação
                  </label>
                  <textarea
                    id="pp-overlay-text2"
                    rows={2}
                    value={finish.overlay.text2}
                    onChange={(e) => setOverlay({ text2: e.target.value })}
                    placeholder="Logo abaixo do título, com a fonte da explicação"
                  />
                </>
              )}
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
            <PartControls
              part={twoParts ? 1 : undefined}
              style={overlay.style}
              bg={overlay.bg}
              color={overlay.color}
              size={overlay.size}
              styleOptions={styleOptions}
              onStyle={(style) => setOverlay({ style })}
              onBg={(bg) => setOverlay({ bg })}
              onColor={(color) => setOverlay({ color })}
              onSize={(size) => setOverlay({ size })}
            />
            {twoParts && (
              <PartControls
                part={2}
                style={overlay.style2}
                bg={overlay.bg2}
                color={overlay.color2}
                size={overlay.size2}
                styleOptions={styleOptions}
                onStyle={(style2) => setOverlay({ style2 })}
                onBg={(bg2) => setOverlay({ bg2 })}
                onColor={(color2) => setOverlay({ color2 })}
                onSize={(size2) => setOverlay({ size2 })}
              />
            )}
            <div className="field-row controls">
              <Segmented<Overlay["position"]>
                label="Posição"
                options={[
                  { id: "top", label: "Em cima" },
                  { id: "center", label: "No meio" },
                  { id: "bottom", label: "Embaixo" },
                ]}
                value={finish.overlay.position}
                onChange={setPosition}
              />
            </div>
            <p className="hint">
              {[
                moved
                  ? "Você mudou o texto de lugar na prévia; para voltar ao lugar padrão, toque numa opção de Posição."
                  : `Na prévia, dá para arrastar ${twoParts ? "o título e a explicação" : "o texto"} para outro lugar.`,
                stories &&
                  `${twoParts ? "As mesmas fontes, fundos e cores valem" : "O mesmo estilo, o fundo e a cor valem"} para todas as telas. Em cima e embaixo ficam livres as áreas cobertas pelos botões do story.`,
                !stories && several && "O texto vai só na capa (foto 1).",
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          </>
        )}
      </section>

      <section className="block" aria-labelledby="pp-photo" ref={photoSection}>
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
              narrowColumns={3}
            />
            <p className="hint">
              {spec.hint}. {several && "No carrossel, todas as fotos usam o mesmo formato."}
            </p>
          </>
        )}
        {several && (
          <div className="field">
            <span className="label">{stories ? "Tela que você está ajustando" : "Foto que você está ajustando"}</span>
            <PhotoStrip photos={photos} destination={destination} active={active} onActive={setActive} lowRes={lowRes} />
          </div>
        )}
        <Segmented<"fill" | "fit">
          label="Enquadramento"
          options={[
            { id: "fill", label: "Preencher a tela" },
            { id: "fit", label: "Foto inteira" },
          ]}
          value={framingPreset}
          onChange={(preset) => setFraming(active, { ...photo.framing, zoom: preset === "fill" ? 1 : wholeZoom })}
        />
        <SharpnessNote photo={photo} spec={spec} label={photoLabel(active)} />
        <div className="field">
          <label className="label" htmlFor="pp-zoom">
            Zoom
          </label>
          <input
            id="pp-zoom"
            type="range"
            // no passo de 0,01 a partir de um número redondo, o zoom 1 (preencher a tela) cai num ponto do controle
            min={Math.floor(smallestZoom * 100) / 100}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setFraming(active, { ...photo.framing, zoom: snapZoom(Number(e.target.value), wholeZoom) })}
          />
        </div>
        <p className="hint with-icon">
          <Move size={15} aria-hidden="true" />
          <span>
            Diminua o zoom para mostrar mais da foto, até ela inteira ou menor. Na prévia, arraste a foto (ou use as setas
            do teclado) para escolher o que aparece e onde ela fica, e faça pinça com dois dedos para o zoom (no
            computador, com a pinça do trackpad ou Ctrl + roda do mouse).
            {zoom < 0.995 && " O espaço que sobra fica com a própria foto, desfocada."}
          </span>
        </p>
        <button type="button" className="btn ghost small" onClick={() => setFraming(active, { ...photo.framing, x: 0, y: 0 })}>
          Centralizar de novo
        </button>
      </section>

      {stories && (
        <StickersSection
          frames={frames.slice(0, photos.length)}
          onRemove={(i) => {
            setFrames(photos.map((_, k) => {
              const f = frames[k] ?? { text: "", sticker: null };
              return k === i ? { ...f, sticker: null, stickerAt: undefined } : f;
            }));
            notify("Figurinha removida.");
          }}
        />
      )}
      <HiddenTagsSection hashtags={stories ? storyTags : draft.hashtags} stories={stories} />
      <MusicSection music={result.music} value={finish.music} onChange={(i) => set({ music: i })} stories={stories} />
      <PlaceSection
        places={result.places}
        value={finish.place}
        onChange={(i) => set({ place: i })}
        photos={photos}
        useMeta={useMeta}
        stories={stories}
      />

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
            {storyTags.length > 0 && (
              <li>
                {several ? "Na tela 1 (e nas outras, se quiser), toque" : "Toque"} em <b>Aa</b>, cole as hashtags e
                esconda como mostra <b>Hashtags ocultas</b>, acima.
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
            {draft.hashtags.length > 0 && (
              <li>Publique e, logo em seguida, comente no seu post colando as hashtags copiadas.</li>
            )}
            <li>
              {draft.hashtags.length > 0 ? "Responda" : "Publique e responda"} aos comentários na primeira hora: isso
              ajuda o post a alcançar mais gente.
            </li>
          </ol>
        )}
      </section>

      {adjusting && photo && <MiniPreview photo={photo} spec={spec} overlay={overlays[active] ?? null} />}

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
