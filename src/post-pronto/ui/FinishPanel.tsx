import {
  ArrowLeft, Crop, Download, ExternalLink, FileText, Images, Lightbulb, ListOrdered, MapPin, Move, Music, Share2,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fullCaption, musicLabel, postText, type PostSummary } from "../caption";
import { mapsPoint, mapsSearch, spotifySearch, youtubeSearch } from "../links";
import type { Photo } from "../photos";
import { formatTakenAt } from "../prompts";
import {
  DEFAULT_FRAMING, ensureOverlayFont, exportJpeg, FORMATS, type FormatId, formatSpec, type Framing, type Overlay,
  OVERLAY_STYLES, type OverlayStyle,
} from "../render";
import type { Saver } from "../save";
import type { Draft, Suggestions } from "../types";
import { makeZip } from "../zip";
import { CopyButton, Segmented, Toggle } from "./parts";
import { PhotoStrip } from "./PhotoStrip";

export interface FinishState {
  format: FormatId;
  overlayOn: boolean;
  overlay: Overlay;
  /** Música e localização escolhidas (-1 = nenhuma). */
  music: number;
  place: number;
  altText: string;
}

const photoName = (i: number, total: number) => (total === 1 ? "post-pronto.jpg" : `post-pronto-${i + 1}.jpg`);

export function FinishPanel({
  photos,
  active,
  setActive,
  finish,
  setFinish,
  setFraming,
  result,
  draft,
  useMeta,
  saver,
  notify,
  onBack,
  onReset,
}: {
  photos: Photo[];
  active: number;
  setActive: (i: number) => void;
  finish: FinishState;
  setFinish: (f: FinishState) => void;
  setFraming: (index: number, f: Framing) => void;
  result: Suggestions;
  draft: Draft;
  useMeta: boolean;
  saver: Saver | null;
  notify: (message: string) => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [prepared, setPrepared] = useState<File[] | null>(null);
  const spec = formatSpec(finish.format);
  const photo = photos[Math.min(active, photos.length - 1)];
  const overlay = finish.overlayOn && finish.overlay.text.trim() ? finish.overlay : null;
  const music = result.music[finish.music];
  const place = result.places[finish.place];
  const caption = fullCaption(draft);
  const summary: PostSummary = { draft, music, place, altText: finish.altText };
  const located = useMeta ? photos.flatMap((p, i) => (p.meta.lat !== undefined ? [{ i, ...p.meta }] : [])) : [];
  const set = (patch: Partial<FinishState>) => setFinish({ ...finish, ...patch });
  const setOverlay = (patch: Partial<Overlay>) => set({ overlay: { ...finish.overlay, ...patch } });

  // Fotos finais prontas de antemão: o menu de compartilhar do celular precisa abrir logo após o toque
  useEffect(() => {
    let alive = true;
    setPrepared(null);
    const t = setTimeout(async () => {
      if (overlay) await ensureOverlayFont(overlay.style);
      const files = await Promise.all(
        photos.map(async (p, i) => {
          const blob = await exportJpeg(p.img, p.width, p.height, spec, p.framing, i === 0 ? overlay : null);
          return new File([blob], photoName(i, photos.length), { type: "image/jpeg" });
        }),
      );
      if (alive) setPrepared(files);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [photos, spec, overlay]);

  async function deliver(kind: "photos" | "text" | "all") {
    if (!saver || !prepared) return;
    setSaving(kind);
    try {
      let name: string;
      let data: Blob;
      if (kind === "text") {
        name = "legenda.txt";
        data = new Blob([postText(summary)], { type: "text/plain;charset=utf-8" });
      } else if (kind === "photos" && prepared.length === 1) {
        name = prepared[0].name;
        data = prepared[0];
      } else {
        const entries = await Promise.all(
          prepared.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
        );
        if (kind === "all") entries.push({ name: "legenda.txt", data: new TextEncoder().encode(postText(summary)) });
        name = kind === "all" ? "post-pronto.zip" : "post-pronto-fotos.zip";
        data = new Blob([makeZip(entries)], { type: "application/zip" });
      }
      const outcome = await saver.save(name, data);
      if (outcome === "saved") notify(kind === "text" ? "Legenda baixada." : "Download pronto.");
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

  const several = photos.length > 1;
  const story = finish.format === "9:16";

  return (
    <div className="panel-body">
      <h2>Pronto para postar</h2>
      <p className="lead">
        Baixe {several ? `as ${photos.length} fotos` : "a foto"} já no formato do Instagram e copie a legenda. Se quiser,
        ajuste o enquadramento ou escreva um texto na capa logo abaixo.
      </p>

      <section className="block deliver" aria-labelledby="pp-deliver">
        <h3 id="pp-deliver" className="sr-only">
          Baixar e copiar
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
              {!prepared ? "Preparando…" : several ? `Baixar as ${photos.length} fotos (.zip)` : "Baixar a foto"}
            </button>
            <CopyButton
              text={caption}
              label="Copiar legenda"
              onResult={(ok) => notify(ok ? "Legenda copiada." : "Não deu para copiar. Selecione o texto da legenda e copie.")}
            />
            {saver.share && (
              <button type="button" className="btn secondary" disabled={!prepared} onClick={share}>
                <Share2 size={16} aria-hidden="true" /> Compartilhar
              </button>
            )}
          </div>
        ) : (
          <div className="actions">
            <CopyButton
              text={caption}
              label="Copiar legenda"
              className="btn primary big"
              onResult={(ok) => notify(ok ? "Legenda copiada." : "Não deu para copiar. Selecione o texto da legenda e copie.")}
            />
            <p className="hint">Esta tela não permite baixar arquivos. Abra o Post Pronto no navegador para baixar a foto.</p>
          </div>
        )}
        {saver && (
          <div className="actions secondary-actions">
            <button type="button" className="btn ghost small" disabled={saving !== null} onClick={() => deliver("text")}>
              <FileText size={15} aria-hidden="true" /> Baixar legenda, música e local (.txt)
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
          <p className="hint">Ao compartilhar, cole a legenda no Instagram: ela não vai junto com as fotos.</p>
        )}
      </section>

      <section className="block" aria-labelledby="pp-music">
        <h3 id="pp-music">
          <Music size={17} aria-hidden="true" /> Música
        </h3>
        {result.music.length ? (
          <>
            <p className="hint">
              No Instagram, toque em Adicionar música e busque pelo nome. O catálogo muda conforme o país e o tipo de conta.
            </p>
            <ul className="picks">
              {result.music.map((m, i) => (
                <li key={i} className={finish.music === i ? "on" : ""}>
                  <label>
                    <input type="radio" name="pp-music" checked={finish.music === i} onChange={() => set({ music: i })} />
                    <span>
                      <strong>{m.title}</strong>
                      {m.artist && ` – ${m.artist}`}
                      {m.part && <span className="pick-part"> · {m.part}</span>}
                    </span>
                  </label>
                  {m.why && <p className="pick-why">{m.why}</p>}
                  <p className="pick-links">
                    <a href={spotifySearch(`${m.title} ${m.artist}`)} target="_blank" rel="noreferrer">
                      Spotify <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <a href={youtubeSearch(`${m.title} ${m.artist}`)} target="_blank" rel="noreferrer">
                      YouTube <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <CopyButton text={`${m.title} ${m.artist}`.trim()} label="Copiar nome" className="btn ghost small" />
                  </p>
                </li>
              ))}
              <li className={finish.music === -1 ? "on" : ""}>
                <label>
                  <input type="radio" name="pp-music" checked={finish.music === -1} onChange={() => set({ music: -1 })} />
                  <span>Sem música</span>
                </label>
              </li>
            </ul>
          </>
        ) : (
          <p className="hint">O Claude não sugeriu músicas desta vez.</p>
        )}
      </section>

      <section className="block" aria-labelledby="pp-place">
        <h3 id="pp-place">
          <MapPin size={17} aria-hidden="true" /> Localização
        </h3>
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
        {result.places.length ? (
          <ul className="picks">
            {result.places.map((p, i) => (
              <li key={i} className={finish.place === i ? "on" : ""}>
                <label>
                  <input type="radio" name="pp-place" checked={finish.place === i} onChange={() => set({ place: i })} />
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
            <li className={finish.place === -1 ? "on" : ""}>
              <label>
                <input type="radio" name="pp-place" checked={finish.place === -1} onChange={() => set({ place: -1 })} />
                <span>Sem localização</span>
              </label>
            </li>
          </ul>
        ) : (
          <p className="hint">O Claude não sugeriu lugares desta vez.</p>
        )}
      </section>

      <section className="block" aria-labelledby="pp-photo">
        <h3 id="pp-photo">
          <Crop size={17} aria-hidden="true" /> Foto
        </h3>
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
        {several && (
          <div className="field">
            <span className="label">Foto que você está ajustando</span>
            <PhotoStrip photos={photos} active={active} onActive={setActive} />
          </div>
        )}
        <Segmented<Framing["mode"]>
          label="Enquadramento"
          options={[
            { id: "fill", label: "Preencher o quadro" },
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

      <section className="block" aria-labelledby="pp-overlay">
        <h3 id="pp-overlay">
          <Type size={17} aria-hidden="true" /> Texto na foto
        </h3>
        <Toggle checked={finish.overlayOn} onChange={(overlayOn) => set({ overlayOn })} label="Escrever um texto na capa" />
        {finish.overlayOn && (
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
            {several && <p className="hint">O texto vai só na capa (foto 1).</p>}
          </>
        )}
      </section>

      <section className="block" aria-labelledby="pp-alt">
        <h3 id="pp-alt">Texto alternativo</h3>
        <p className="hint">Descreve a foto para quem usa leitor de tela. Também ajuda o Instagram a entender o post.</p>
        <textarea
          aria-labelledby="pp-alt"
          rows={3}
          value={finish.altText}
          onChange={(e) => set({ altText: e.target.value })}
        />
        <CopyButton text={finish.altText} label="Copiar texto alternativo" className="btn ghost small" />
      </section>

      {result.tips.length > 0 && (
        <section className="block" aria-labelledby="pp-tips">
          <h3 id="pp-tips">
            <Lightbulb size={17} aria-hidden="true" /> Dicas do Claude para este post
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
        <ol className="how">
          <li>
            No Instagram, toque em <b>+</b> e escolha <b>{story ? "Story" : "Publicação"}</b>.
          </li>
          <li>
            {several
              ? `Selecione as ${photos.length} fotos baixadas, na ordem dos números (a 1 é a capa).`
              : "Selecione a foto baixada."}{" "}
            {!story && "Ela já está no formato certo: toque no ícone de expandir para não cortar."}
          </li>
          {!story && <li>Na tela da legenda, cole o texto copiado.</li>}
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
          {!story && finish.altText.trim() && (
            <li>
              Em <b>Configurações avançadas</b>, na parte de acessibilidade, cole o texto alternativo.
            </li>
          )}
          <li>Publique e responda aos comentários na primeira hora: isso ajuda o post a alcançar mais gente.</li>
        </ol>
      </section>

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar para a legenda
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
