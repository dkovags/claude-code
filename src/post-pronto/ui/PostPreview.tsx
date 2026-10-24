import { Bookmark, ChevronLeft, ChevronRight, Ellipsis, Heart, MessageCircle, Music, Send } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { feedExcerpt, fullCaption } from "../caption";
import { drawPost, ensureOverlayFont, type FormatSpec, type Framing, type Overlay, pan } from "../render";
import type { Draft, MusicPick, PlacePick } from "../types";

export interface PreviewSource {
  img: CanvasImageSource;
  width: number;
  height: number;
}

/** Largura da prévia em pixels do canvas (nítida em telas de alta densidade). */
const PREVIEW_W = 720;

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

/** Prévia do post como aparece no feed: foto no formato escolhido, música, local e legenda. */
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
  index: number;
  count: number;
  onIndex: (i: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fontsReady, setFontsReady] = useState(0);
  const W = PREVIEW_W;
  const H = Math.round((PREVIEW_W * spec.h) / spec.w);
  const name = handle || "seu_perfil";
  const caption = draft ? fullCaption(draft) : "";
  const excerpt = feedExcerpt(caption);
  const canPan = !!editable && framing.mode === "fill" && !!onFraming;

  useEffect(() => setExpanded(false), [caption]);

  useEffect(() => {
    if (!overlay) return;
    let alive = true;
    ensureOverlayFont(overlay.style).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [overlay?.style]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    drawPost(c.getContext("2d")!, source.img, source.width, source.height, W, H, framing, overlay);
  }, [source, W, H, framing, overlay, fontsReady]);

  const move = (dx: number, dy: number, start = framing) =>
    onFraming?.(pan(start, dx, dy, source.width, source.height, spec.w, spec.h));

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: framing };
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    move((e.clientX - d.x) / rect.width, (e.clientY - d.y) / rect.height, d.start);
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!canPan) return;
    const step = e.shiftKey ? 0.1 : 0.03;
    // as setas movem a foto, como se ela fosse arrastada naquela direção
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    move(...keys[e.key]);
  };

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

      <div className={`shot${canPan ? " editing" : ""}`}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={
            example
              ? "Exemplo: pôr do sol no mar, com duas pessoas sentadas na pedra"
              : `Prévia da foto ${index + 1} no formato ${spec.label}${canPan ? ". Arraste para enquadrar" : ""}`
          }
          tabIndex={canPan ? 0 : -1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        />
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
