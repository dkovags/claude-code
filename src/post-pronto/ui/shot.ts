import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { drawPost, ensureOverlayFont, type FormatSpec, type Framing, type Overlay, pan } from "../render";

export interface PreviewSource {
  img: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Canvas da prévia: desenha a foto com o enquadramento e o texto, e deixa arrastar a foto (ou usar as setas)
 * para enquadrar quando `onFraming` é passado.
 */
export function useShot({
  source,
  spec,
  framing,
  overlay,
  width,
  onFraming,
}: {
  source: PreviewSource;
  spec: FormatSpec;
  framing: Framing;
  overlay: Overlay | null;
  /** Largura do canvas em pixels (a altura segue o formato). */
  width: number;
  onFraming?: (f: Framing) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const H = Math.round((width * spec.h) / spec.w);
  const canPan = framing.mode === "fill" && !!onFraming;

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
    c.width = width;
    c.height = H;
    drawPost(c.getContext("2d")!, source.img, source.width, source.height, width, H, framing, overlay);
  }, [source, width, H, framing, overlay, fontsReady]);

  const move = (dx: number, dy: number, start = framing) =>
    onFraming?.(pan(start, dx, dy, source.width, source.height, spec.w, spec.h));

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => {
      if (!canPan) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, start: framing };
    },
    onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current;
      if (!d) return;
      const rect = e.currentTarget.getBoundingClientRect();
      move((e.clientX - d.x) / rect.width, (e.clientY - d.y) / rect.height, d.start);
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (e: KeyboardEvent<HTMLCanvasElement>) => {
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
    },
  };

  return { canvas, canPan, handlers, tabIndex: canPan ? 0 : -1 };
}
