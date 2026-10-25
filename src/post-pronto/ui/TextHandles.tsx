import { type KeyboardEvent, type PointerEvent, type RefObject, useRef } from "react";
import type { Spot, TextBox } from "../render";

/** O centro onde a caixa cabe inteira na foto (assim o arraste não "prende" além da borda). */
const keepIn = (b: TextBox, at: Spot): Spot => ({
  x: Math.min(1 - b.w / 2, Math.max(b.w / 2, at.x)),
  y: Math.min(1 - b.h / 2, Math.max(b.h / 2, at.y)),
});

/**
 * Alças transparentes sobre os trechos do texto na prévia: arrastar (ou usar as setas) muda o lugar do trecho, e a
 * foto baixada sai igual. O texto em si é desenhado no canvas, embaixo delas.
 */
export function TextHandles({
  boxes,
  frame,
  onMove,
}: {
  boxes: TextBox[];
  /** O quadro da prévia, para converter o arraste em fração da foto. */
  frame: RefObject<HTMLElement | null>;
  onMove: (part: 1 | 2, at: Spot) => void;
}) {
  const grab = useRef<{ box: TextBox; dx: number; dy: number } | null>(null);
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
  return (
    <>
      {boxes.map((b) => (
        <div
          key={b.part}
          className="text-handle"
          role="button"
          tabIndex={0}
          aria-label={`${boxes.length > 1 ? `Trecho ${b.part}` : "Texto"} na foto: arraste (ou use as setas) para mudar de lugar`}
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = spotOf(e);
            // guarda onde o dedo pegou, para a caixa não pular
            grab.current = { box: b, dx: p.x - b.center.x, dy: p.y - b.center.y };
          }}
          onPointerMove={moveTo}
          // o último movimento pode chegar junto com o soltar: a posição final vem dele
          onPointerUp={(e) => {
            moveTo(e);
            grab.current = null;
          }}
          onPointerCancel={() => {
            grab.current = null;
          }}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
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
        />
      ))}
    </>
  );
}
