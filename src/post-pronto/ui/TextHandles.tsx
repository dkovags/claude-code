import { MoveDiagonal2 } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type RefObject, useRef } from "react";
import { type BoxSize, type Spot, type TextBox, textSize } from "../render";

/** O centro onde a caixa cabe inteira na foto (assim o arraste não "prende" além da borda). */
const keepIn = (b: TextBox, at: Spot): Spot => ({
  x: Math.min(1 - b.w / 2, Math.max(b.w / 2, at.x)),
  y: Math.min(1 - b.h / 2, Math.max(b.h / 2, at.y)),
});

/** Menor caixa que as setas do canto pedem, em fração da foto (o texto ainda pode precisar de mais). */
const MIN_BOX = 0.05;

/**
 * Alças transparentes sobre o título e a explicação na prévia: arrastar (ou usar as setas) muda o lugar de cada um, e
 * a foto baixada sai igual. As setas do canto mudam o tamanho da caixa, com o canto de cima à esquerda parado: a letra
 * fica, e as linhas quebram na nova largura. As teclas + e - mudam o tamanho da letra, como a pinça em cima do texto ou
 * em volta dele, pelo quadro da prévia (`useShot`). O texto em si é desenhado no canvas, embaixo delas.
 */
export function TextHandles({
  boxes,
  frame,
  pinching,
  sizes,
  onMove,
  onResize,
  onBox,
}: {
  boxes: TextBox[];
  /** O quadro da prévia, para converter o arraste em fração da foto. */
  frame: RefObject<HTMLElement | null>;
  /** Pinça em andamento no quadro: com dois dedos, o texto para de acompanhar o dedo. */
  pinching?: { current: boolean };
  /** Tamanho da letra do título e da explicação. */
  sizes?: [number, number];
  onMove: (part: 1 | 2, at: Spot) => void;
  /** Tamanho da letra (teclas + e -). */
  onResize?: (part: 1 | 2, size: number) => void;
  /** Tamanho da caixa (setas do canto), com o novo centro. */
  onBox?: (part: 1 | 2, box: BoxSize, at: Spot) => void;
}) {
  const grab = useRef<{ box: TextBox; dx: number; dy: number } | null>(null);
  const resize = useRef<{ box: TextBox; dx: number; dy: number } | null>(null);
  const spotOf = (e: PointerEvent): Spot => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const p = spotOf(e);
    onMove(g.box.part, keepIn(g.box, { x: p.x - g.dx, y: p.y - g.dy }));
  };
  const resizeTo = (e: PointerEvent<HTMLSpanElement>) => {
    const r = resize.current;
    if (!r || pinching?.current) return;
    // o canto de baixo à direita acompanha o dedo; o de cima à esquerda fica parado
    const p = spotOf(e);
    const { x: left, y: top } = r.box;
    const right = Math.min(1, Math.max(left + MIN_BOX, p.x - r.dx));
    const bottom = Math.min(1, Math.max(top + MIN_BOX, p.y - r.dy));
    onBox?.(r.box.part, { w: right - left, h: bottom - top }, { x: (left + right) / 2, y: (top + bottom) / 2 });
  };
  const name = (part: 1 | 2) => (boxes.length < 2 ? "Texto" : part === 1 ? "Título" : "Explicação");
  return (
    <>
      {boxes.map((b) => (
        <div
          key={b.part}
          className="text-handle"
          data-part={b.part}
          role="button"
          tabIndex={0}
          aria-label={`${name(b.part)} na foto: arraste (ou use as setas) para mudar de lugar${onResize ? "; + e - mudam o tamanho da letra" : ""}`}
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          onPointerDown={(e) => {
            // o segundo dedo é da pinça; e as setas do canto mudam o tamanho da caixa, não o lugar
            if (!e.isPrimary || pinching?.current || (e.target as Element).closest(".text-resize")) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = spotOf(e);
            // guarda onde o dedo pegou, para a caixa não pular
            grab.current = { box: b, dx: p.x - b.center.x, dy: p.y - b.center.y };
          }}
          onPointerMove={(e) => {
            if (pinching?.current) grab.current = null;
            else moveTo(e);
          }}
          // o último movimento pode chegar junto com o soltar: a posição final vem dele
          onPointerUp={(e) => {
            if (!pinching?.current) moveTo(e);
            grab.current = null;
          }}
          onPointerCancel={() => {
            grab.current = null;
          }}
          onLostPointerCapture={() => {
            grab.current = null;
          }}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            const size = sizes?.[b.part - 1];
            if (onResize && size !== undefined && ["+", "=", "-"].includes(e.key)) {
              e.preventDefault();
              onResize(b.part, textSize(size + (e.key === "-" ? -0.05 : 0.05)));
              return;
            }
            const step = e.shiftKey ? 0.05 : 0.01;
            const keys: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            if (!keys[e.key]) return;
            e.preventDefault();
            onMove(b.part, keepIn(b, { x: b.center.x + keys[e.key][0], y: b.center.y + keys[e.key][1] }));
          }}
        >
          {onBox && (
            <span
              className="text-resize"
              aria-hidden="true"
              title="Puxe para mudar o tamanho da caixa"
              onPointerDown={(e) => {
                if (!e.isPrimary || pinching?.current) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                // guarda onde o dedo pegou em relação ao canto, para a caixa não pular
                const p = spotOf(e);
                resize.current = { box: b, dx: p.x - (b.x + b.w), dy: p.y - (b.y + b.h) };
              }}
              onPointerMove={resizeTo}
              onPointerUp={(e) => {
                resizeTo(e);
                resize.current = null;
              }}
              onPointerCancel={() => {
                resize.current = null;
              }}
              onLostPointerCapture={() => {
                resize.current = null;
              }}
            >
              <MoveDiagonal2 aria-hidden="true" />
            </span>
          )}
        </div>
      ))}
    </>
  );
}
