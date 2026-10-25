import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, Heart, MessageCircle, Music, Send } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { feedExcerpt } from "../caption";
import type { FormatSpec, Framing, Overlay, Spot } from "../render";
import type { Draft, MusicPick, PlacePick } from "../types";
import { type PreviewSource, useShot } from "./shot";
import { TextHandles } from "./TextHandles";

/** Legenda com as hashtags destacadas, como no app. */
function CaptionBody({ text }: { text: string }) {
  return (
    <>
      {text.split(/(#[\p{L}\p{N}_]+)/u).map((part, i) =>
        part.startsWith("#") ? (
          <span key={i} className="hashtag">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Prévia do post como aparece no feed: foto no formato escolhido, música, local e legenda (sem as hashtags ocultas). */
export function PostPreview({
  source,
  spec,
  framing,
  overlay,
  draft,
  handle,
  music,
  place,
  example,
  editable,
  onFraming,
  onTextMove,
  index,
  count,
  onIndex,
}: {
  source: PreviewSource;
  spec: FormatSpec;
  framing: Framing;
  overlay: Overlay | null;
  draft: Draft | null;
  handle: string;
  music?: MusicPick;
  place?: PlacePick;
  example?: boolean;
  /** Permite arrastar a foto para enquadrar. */
  editable?: boolean;
  onFraming?: (f: Framing) => void;
  /** Arrastar um trecho do texto da capa: muda o lugar dele na foto baixada. */
  onTextMove?: (part: 1 | 2, at: Spot) => void;
  index: number;
  count: number;
  onIndex: (i: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const shot = useShot({ source, spec, framing, overlay, width: 720, onFraming: editable ? onFraming : undefined });
  const name = handle || "seu_perfil";
  const caption = draft ? draft.text.trim() : "";
  const excerpt = feedExcerpt(caption);
  const canPan = shot.canPan;

  useEffect(() => setExpanded(false), [caption]);

  return (
    <figure className="feed" style={{ "--ratio": spec.w / spec.h } as CSSProperties}>
      {example && <span className="example-tag">Exemplo</span>}
      <header className="feed-head">
        <span className="avatar" aria-hidden="true">
          {name[0].toUpperCase()}
        </span>
        <span className="feed-who">
          <strong>{name}</strong>
          {place && <span className="feed-sub">{place.name}</span>}
          {music && (
            <span className="feed-sub">
              <Music size={11} aria-hidden="true" /> {music.artist ? `${music.artist} · ${music.title}` : music.title}
            </span>
          )}
        </span>
        <Ellipsis size={18} aria-hidden="true" className="feed-more" />
      </header>

      <div className={`shot${canPan ? " editing" : ""}`} ref={frame}>
        <canvas
          ref={shot.canvas}
          role="img"
          aria-label={
            example
              ? "Exemplo: pôr do sol no mar, com duas pessoas sentadas na pedra"
              : `Prévia da foto ${index + 1} no formato ${spec.label}${canPan ? ". Arraste para enquadrar" : ""}`
          }
          tabIndex={shot.tabIndex}
          {...shot.handlers}
        />
        {onTextMove && <TextHandles boxes={shot.boxes} frame={frame} onMove={onTextMove} />}
        {canPan && (
          <>
            <i className="crop tl" aria-hidden="true" />
            <i className="crop tr" aria-hidden="true" />
            <i className="crop bl" aria-hidden="true" />
            <i className="crop br" aria-hidden="true" />
          </>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              className="nav prev"
              aria-label="Foto anterior"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="nav next"
              aria-label="Próxima foto"
              disabled={index === count - 1}
              onClick={() => onIndex(index + 1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <span className="count-badge">
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>

      <div className="feed-actions" aria-hidden="true">
        <Heart size={22} />
        <MessageCircle size={22} />
        <Send size={22} />
        {count > 1 && (
          <span className="dots">
            {Array.from({ length: count }, (_, i) => (
              <i key={i} className={i === index ? "on" : ""} />
            ))}
          </span>
        )}
        <Bookmark size={22} className="end" />
      </div>

      <figcaption className="feed-caption">
        {draft ? (
          <>
            <strong>{name}</strong>{" "}
            {expanded ? (
              <CaptionBody text={caption} />
            ) : (
              <>
                <CaptionBody text={excerpt.shown} />
                {excerpt.truncated && (
                  <>
                    {"… "}
                    <button type="button" className="more" onClick={() => setExpanded(true)}>
                      mais
                    </button>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <span className="muted">A legenda escolhida aparece aqui.</span>
        )}
      </figcaption>
    </figure>
  );
}
