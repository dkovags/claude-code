import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  drawPost, ensureOverlayFonts, fitZoom, type FormatSpec, type Framing, MAX_ZOOM, minZoom, type Overlay, overlayStyles,
  pan, pinch, snapZoom, type Spot, type TextBox, textBoxes,
} from "../render";

export interface PreviewSource {
  img: CanvasImageSource;
  width: number;
  height: number;
}

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Canvas da prévia: desenha a foto com o enquadramento e o texto. Quando `onFraming` é passado, dá para enquadrar na
 * prévia: arrastar a foto com um dedo (ou usar as setas), fazer pinça com dois dedos para o zoom e, no computador, a
 * pinça do trackpad ou Ctrl + roda do mouse. Os gestos valem no quadro todo (`surface`), também em cima dos textos e
 * da figurinha: com dois dedos, o arraste deles para (`pinching`). Devolve também onde ficou cada trecho (`boxes`).
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
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null);
  // dedos (ou o mouse) no quadro, e o começo da pinça
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ d: number; mid: Spot; start: Framing } | null>(null);
  const pinching = useRef(false);
  // o enquadramento e o callback mais recentes, para o gesto e a roda do mouse não usarem valores velhos
  const latest = useRef({ framing, onFraming });
  latest.current = { framing, onFraming };
  const [fontsReady, setFontsReady] = useState(0);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  const H = Math.round((width * spec.h) / spec.w);
  const canPan = !!onFraming;
  const whole = fitZoom(source.width, source.height, spec.w, spec.h);
  const zoomOf = (f: Framing) => Math.min(MAX_ZOOM, Math.max(minZoom(source.width, source.height, spec.w, spec.h), f.zoom));
  /** Zoom com o meio dos dedos (ou o cursor) indo de `from` para `to`, em fração do quadro. */
  const zoomAround = (start: Framing, zoom: number, from: Spot, to: Spot) =>
    pinch(start, snapZoom(zoom, whole, 0.02), from, to, source.width, source.height, spec.w, spec.h);

  const fonts = overlay ? overlayStyles(overlay).join(" ") : "";
  useEffect(() => {
    if (!overlay) return;
    let alive = true;
    ensureOverlayFonts(overlay).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
    // só as fontes importam aqui: o texto muda a cada tecla
  }, [fonts]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = width;
    c.height = H;
    const layout = drawPost(c.getContext("2d")!, source.img, source.width, source.height, width, H, framing, overlay);
    const next = layout ? textBoxes(layout, width, H) : [];
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [source, width, H, framing, overlay, fontsReady]);

  // pinça do trackpad (chega como roda com Ctrl) ou Ctrl + roda do mouse; a roda sozinha continua rolando a página
  useEffect(() => {
    const el = surface.current;
    if (!el || !canPan) return;
    const onWheel = (e: WheelEvent) => {
      const { framing: f, onFraming: set } = latest.current;
      if (!e.ctrlKey || !set) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      set(zoomAround(f, zoomOf(f) * Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01), at, at));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canPan, source, spec]);

  const move = (dx: number, dy: number, start = framing) =>
    onFraming?.(pan(start, dx, dy, source.width, source.height, spec.w, spec.h));

  const spotIn = (r: DOMRect, p: Point): Spot => ({ x: (p.x - r.left) / r.width, y: (p.y - r.top) / r.height });
  const midOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // em cima dos textos e da figurinha, um dedo arrasta só eles; os botões (telas, remover) ficam de fora
  const onPhoto = (e: PointerEvent) => !(e.target as Element).closest(".text-handle, .sticker-drag");
  const release = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinchStart.current && pointers.current.size < 2) {
      pinchStart.current = null;
      // o dedo que ficou continua arrastando a foto, a partir de onde ela está
      const rest = [...pointers.current.values()][0];
      drag.current = rest ? { ...rest, start: latest.current.framing } : null;
    }
    if (!pointers.current.size) {
      drag.current = null;
      pinching.current = false;
    }
  };

  const surfaceHandlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (!canPan || (e.target as Element).closest("button")) return;
      const p = { x: e.clientX, y: e.clientY };
      pointers.current.set(e.pointerId, p);
      const capture = () => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // o ponteiro já foi solto
        }
      };
      if (pointers.current.size === 1) {
        if (!onPhoto(e)) return;
        capture();
        drag.current = { ...p, start: framing };
        return;
      }
      // segundo dedo: começa a pinça, e o arraste de um dedo (da foto, do texto ou da figurinha) para
      capture();
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      pinching.current = true;
      pinchStart.current = { d: Math.max(1, distance(a, b)), mid: spotIn(e.currentTarget.getBoundingClientRect(), midOf(a, b)), start: framing };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const p = pointers.current.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const r = e.currentTarget.getBoundingClientRect();
      const s = pinchStart.current;
      if (s && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        onFraming?.(zoomAround(s.start, zoomOf(s.start) * (distance(a, b) / s.d), s.mid, spotIn(r, midOf(a, b))));
        return;
      }
      const d = drag.current;
      if (d) move((e.clientX - d.x) / r.width, (e.clientY - d.y) / r.height, d.start);
    },
    onPointerUp: release,
    onPointerCancel: release,
  };

  const handlers = {
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

  return { canvas, surface, surfaceHandlers, pinching, canPan, handlers, tabIndex: canPan ? 0 : -1, boxes };
}
