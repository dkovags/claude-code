import { ChevronLeft, ChevronRight, Heart, Link2, MapPin, Music, Send } from "lucide-react";
import { STICKER_LABELS } from "../caption";
import { formatSpec, type Framing, type Overlay } from "../render";
import type { MusicPick, PlacePick, Sticker } from "../types";
import { type PreviewSource, useShot } from "./shot";

const STORY = formatSpec("9:16");

/** A figurinha sugerida, tracejada: mostra onde ela entra, mas não vai na foto baixada. */
function StickerGhost({ sticker }: { sticker: Sticker }) {
  const options = sticker.options.map((o) => o.trim()).filter(Boolean);
  return (
    <div className={`story-ghost sticker-ghost k-${sticker.kind}`}>
      <span className="ghost-kind">{STICKER_LABELS[sticker.kind]}</span>
      <strong className="ghost-text">
        {sticker.kind === "link" && <Link2 size={13} aria-hidden="true" />} {sticker.text}
      </strong>
      {(sticker.kind === "poll" || sticker.kind === "quiz") && (
        <span className="ghost-options">
          {options.map((o) => (
            <span key={o}>{o}</span>
          ))}
        </span>
      )}
      {sticker.kind === "slider" && (
        <span className="ghost-slider">
          <i />
          <b>{options[0] ?? "😍"}</b>
        </span>
      )}
      {sticker.kind === "question" && <span className="ghost-field">Toque para responder</span>}
      {sticker.kind === "add-yours" && <span className="ghost-field">Adicione o seu</span>}
      {sticker.kind === "countdown" && <span className="ghost-field">00 : 00 : 00</span>}
    </div>
  );
}

/** Prévia de story: a foto em tela cheia, o texto escrito nela e, tracejadas, as figurinhas a adicionar. */
export function StoryPreview({
  source,
  framing,
  overlay,
  sticker,
  handle,
  music,
  place,
  example,
  editable,
  onFraming,
  index,
  count,
  onIndex,
}: {
  source: PreviewSource;
  framing: Framing;
  overlay: Overlay | null;
  sticker: Sticker | null;
  handle: string;
  music?: MusicPick;
  place?: PlacePick;
  example?: boolean;
  editable?: boolean;
  onFraming?: (f: Framing) => void;
  index: number;
  count: number;
  onIndex: (i: number) => void;
}) {
  const shot = useShot({ source, spec: STORY, framing, overlay, width: 540, onFraming: editable ? onFraming : undefined });
  const name = handle || "seu_perfil";
  const textAt = overlay?.text.trim() ? overlay.position : null;
  // figurinhas empilhadas na parte livre da tela: longe do texto, do topo e da barra de resposta
  const area =
    textAt === "bottom"
      ? { top: "15%", bottom: "42%" }
      : textAt === "center"
        ? { top: "63%", bottom: "11%", justifyContent: "flex-start" }
        : { top: "34%", bottom: "11%" };
  const ghosts = !!sticker || !!place;

  return (
    <figure className="story">
      {example && <span className="example-tag">Exemplo</span>}
      <div className={`story-screen${shot.canPan ? " editing" : ""}`}>
        <canvas
          ref={shot.canvas}
          role="img"
          aria-label={
            example
              ? "Exemplo de story: pôr do sol no mar, com o texto Fim de tarde que pede pausa"
              : `Prévia da tela ${index + 1} do story${shot.canPan ? ". Arraste para enquadrar" : ""}`
          }
          tabIndex={shot.tabIndex}
          {...shot.handlers}
        />
        <div className="story-top" aria-hidden="true">
          <div className="story-bars">
            {Array.from({ length: Math.max(1, count) }, (_, i) => (
              <i key={i} className={i < index ? "done" : i === index ? "on" : ""} />
            ))}
          </div>
          <div className="story-head">
            <span className="avatar">{name[0].toUpperCase()}</span>
            <span className="story-who">
              <span>
                <strong>{name}</strong> <span className="story-time">agora</span>
              </span>
              {music && (
                <span className="story-music">
                  <Music size={11} /> {music.artist ? `${music.title} · ${music.artist}` : music.title}
                </span>
              )}
            </span>
          </div>
        </div>
        {ghosts && (
          <div className="story-ghosts" style={area}>
            {sticker && <StickerGhost sticker={sticker} />}
            {place && (
              <span className="story-ghost place-ghost">
                <MapPin size={13} aria-hidden="true" /> {place.name.toLocaleUpperCase("pt-BR")}
              </span>
            )}
          </div>
        )}
        <div className="story-reply" aria-hidden="true">
          <span>Enviar mensagem</span>
          <Heart size={20} />
          <Send size={20} />
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              className="nav prev"
              aria-label="Tela anterior"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nav next"
              aria-label="Próxima tela"
              disabled={index === count - 1}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {ghosts && (
        <figcaption className="story-note">
          O que está tracejado você adiciona no Instagram, com as figurinhas. Não vai na foto baixada.
        </figcaption>
      )}
    </figure>
  );
}
