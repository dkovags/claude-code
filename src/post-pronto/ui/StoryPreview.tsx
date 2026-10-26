import { ChevronLeft, ChevronRight, Heart, Link2, MapPin, Music, Send, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useRef } from "react";
import { STICKER_LABELS } from "../caption";
import { formatSpec, type Framing, type Overlay, type Spot } from "../render";
import type { MusicPick, PlacePick, Sticker } from "../types";
import { type PreviewSource, useShot } from "./shot";
import { TextHandles } from "./TextHandles";

const STORY = formatSpec("9:16");

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/**
 * Onde uma figurinha tracejada pode ficar (o centro, em fração da tela): sem sair pelos lados (`half` é metade da
 * largura dela), sem cobrir o perfil, no alto, nem a barra de resposta, embaixo.
 */
const spot = (x: number, y: number, half: number): Spot => ({ x: clamp(x, half, 1 - half), y: clamp(y, 0.12, 0.86) });
/** A figurinha tracejada arrastada fica centrada onde a pessoa a deixou. */
const placedAt = (at?: Spot): CSSProperties | undefined =>
  at && { position: "absolute", left: `${at.x * 100}%`, top: `${at.y * 100}%`, transform: "translate(-50%, -50%)" };

/**
 * Arrastar (ou mover com as setas) uma figurinha tracejada pela tela, só para planejar: ela não vai na foto baixada.
 * `at` é onde ela está; sem ele, ela fica na parte livre da tela. Sem `onMove`, ela fica parada.
 */
function useGhostDrag(
  screen: RefObject<HTMLDivElement | null>,
  pinching: { current: boolean },
  at: Spot | undefined,
  onMove: ((at: Spot) => void) | undefined,
  label: string,
) {
  const grab = useRef<{ dx: number; dy: number; half: number } | null>(null);
  if (!onMove) return {};
  // metade da largura do elemento e o centro dele, em fração da tela
  const halfOf = (el: HTMLElement) =>
    Math.min(0.5, el.getBoundingClientRect().width / 2 / screen.current!.getBoundingClientRect().width);
  const centerOf = (el: HTMLElement): Spot => {
    const s = screen.current!.getBoundingClientRect();
    const g = el.getBoundingClientRect();
    return { x: (g.left + g.width / 2 - s.left) / s.width, y: (g.top + g.height / 2 - s.top) / s.height };
  };
  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const d = grab.current;
    if (!d) return;
    const s = screen.current!.getBoundingClientRect();
    onMove(spot((e.clientX - d.dx - s.left) / s.width, (e.clientY - d.dy - s.top) / s.height, d.half));
  };
  return {
    tabIndex: 0,
    role: "button",
    "aria-label": label,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      // o segundo dedo é da pinça, que enquadra a foto
      if (!e.isPrimary || pinching.current) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const g = e.currentTarget.getBoundingClientRect();
      // guarda onde o dedo pegou, para a figurinha não pular
      grab.current = {
        dx: e.clientX - (g.left + g.width / 2),
        dy: e.clientY - (g.top + g.height / 2),
        half: halfOf(e.currentTarget),
      };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (pinching.current) grab.current = null;
      else moveTo(e);
    },
    // o último movimento pode chegar junto com o soltar: a posição final vem dele
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (!pinching.current) moveTo(e);
      grab.current = null;
    },
    onPointerCancel: () => {
      grab.current = null;
    },
    onLostPointerCapture: () => {
      grab.current = null;
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.08 : 0.03;
      const keys: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (!keys[e.key]) return;
      e.preventDefault();
      const c = at ?? centerOf(e.currentTarget);
      onMove(spot(c.x + keys[e.key][0], c.y + keys[e.key][1], halfOf(e.currentTarget)));
    },
  };
}

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
  stickerAt,
  onStickerMove,
  onStickerRemove,
  placeAt,
  onPlaceMove,
  onTextMove,
  textSizes,
  onTextSize,
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
  /** Lugar escolhido para a figurinha tracejada; sem ele, ela fica na parte livre da tela. */
  stickerAt?: Spot;
  /** Arrastar a figurinha tracejada (só para planejar: ela não vai na foto baixada). */
  onStickerMove?: (at: Spot) => void;
  /** Tirar a figurinha da tela. */
  onStickerRemove?: () => void;
  /** Lugar escolhido para a localização tracejada; sem ele, ela fica embaixo da figurinha. */
  placeAt?: Spot;
  /** Arrastar a localização tracejada (também só para planejar). */
  onPlaceMove?: (at: Spot) => void;
  /** Arrastar um trecho do texto: muda o lugar dele na foto baixada. */
  onTextMove?: (part: 1 | 2, at: Spot) => void;
  /** Tamanho do título e da explicação, que a pinça ou a alça do canto mudam. */
  textSizes?: [number, number];
  onTextSize?: (part: 1 | 2, size: number) => void;
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
  const shot = useShot({
    source,
    spec: STORY,
    framing,
    overlay,
    width: 540,
    onFraming: editable ? onFraming : undefined,
    textSizes: onTextMove ? textSizes : undefined,
    onTextSize: onTextMove ? onTextSize : undefined,
  });
  const name = handle || "seu_perfil";
  // o quadro da prévia: é nele que valem os gestos de enquadrar (arrastar e pinça)
  const screen = shot.surface;
  const textPosition = overlay && (overlay.text.trim() || overlay.text2.trim()) ? overlay.position : null;
  // figurinhas empilhadas na parte livre da tela: longe do texto, do topo e da barra de resposta
  const [top, bottom, justifyContent] =
    textPosition === "bottom"
      ? [15, 42, "center"]
      : textPosition === "center"
        ? [63, 11, "flex-start"]
        : [34, 11, "center"];
  const movableText = !!onTextMove && shot.boxes.length > 0;
  // a camada cobre a tela toda (a figurinha arrastada se posiciona nela); o espaçamento delimita a parte livre.
  // Espaçamento em % vale sobre a largura, e a tela é 9:16
  const area = { paddingTop: `${(top * 16) / 9}%`, paddingBottom: `${(bottom * 16) / 9}%`, justifyContent };
  const ghosts = !!sticker || !!place;
  const movable = !!sticker && !!onStickerMove;
  const placeMovable = !!place && !!onPlaceMove;
  const stickerDrag = useGhostDrag(
    screen,
    shot.pinching,
    stickerAt,
    movable ? onStickerMove : undefined,
    "Figurinha tracejada: arraste (ou use as setas) para ver onde ela fica melhor",
  );
  const placeDrag = useGhostDrag(
    screen,
    shot.pinching,
    placeAt,
    placeMovable ? onPlaceMove : undefined,
    `Localização tracejada${place ? ` (${place.name})` : ""}: arraste (ou use as setas) para ver onde ela fica melhor`,
  );
  const dragNote =
    movable && placeMovable
      ? " Arraste a figurinha e a localização para ver onde elas ficam melhor."
      : movable
        ? " Arraste a figurinha para ver onde ela fica melhor."
        : placeMovable
          ? " Arraste a localização para ver onde ela fica melhor."
          : "";
  const stickerEl = sticker && (
    <div className={`sticker-drag${movable ? " movable" : ""}`} style={placedAt(stickerAt)} {...stickerDrag}>
      <StickerGhost sticker={sticker} />
      {onStickerRemove && (
        <button
          type="button"
          className="ghost-remove"
          aria-label="Remover a figurinha"
          title="Remover a figurinha"
          // tocar no × não pode começar a arrastar
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={onStickerRemove}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <figure className="story">
      {example && <span className="example-tag">Exemplo</span>}
      <div className={`story-screen${shot.canPan ? " editing" : ""}`} ref={screen} {...shot.surfaceHandlers}>
        <canvas
          ref={shot.canvas}
          role="img"
          aria-label={
            example
              ? "Exemplo de story: pôr do sol no mar, com o texto Fim de tarde que pede pausa"
              : `Prévia da tela ${index + 1} do story${shot.canPan ? ". Arraste ou faça pinça para enquadrar" : ""}`
          }
          tabIndex={shot.tabIndex}
          {...shot.handlers}
        />
        {movableText && (
          <TextHandles
            boxes={shot.boxes}
            frame={screen}
            pinching={shot.pinching}
            sizes={textSizes}
            onMove={onTextMove!}
            onResize={onTextSize}
          />
        )}
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
          // a figurinha fica sempre no mesmo lugar da página, para o arraste não se perder ao mudar de posição
          <div className="story-ghosts" style={area}>
            {stickerEl}
            {place && (
              <div className={`place-drag${placeMovable ? " movable" : ""}`} style={placedAt(placeAt)} {...placeDrag}>
                <span className="story-ghost place-ghost">
                  <MapPin size={13} aria-hidden="true" /> {place.name.toLocaleUpperCase("pt-BR")}
                </span>
              </div>
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
      {(ghosts || movableText || (shot.canPan && !example)) && (
        <figcaption className="story-note">
          {ghosts && "O que está tracejado você adiciona no Instagram, com as figurinhas. Não vai na foto baixada."}
          {shot.canPan && !example && " Arraste a foto para enquadrar e faça pinça com dois dedos para o zoom."}
          {dragNote}
          {movableText &&
            ` Arraste os textos para mudar o lugar deles na foto${onTextSize ? "; para o tamanho, faça pinça em cima do texto ou em volta dele, ou puxe as setas no canto da caixa" : ""}.`}
        </figcaption>
      )}
    </figure>
  );
}
