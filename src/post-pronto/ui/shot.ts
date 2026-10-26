import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  drawPost, ensureOverlayFonts, fitZoom, type FormatSpec, type Framing, MAX_ZOOM, minZoom, type Overlay, overlayStyles,
  pan, pinch, snapZoom, type Spot, type TextBox, textBoxes, textSize,
} from "../render";

export interface PreviewSource {
  img: CanvasImageSource;
  width: number;
  height: number;
}

type Point = { x: number; y: number };
/** Um dedo (ou o mouse) no quadro, e o trecho do texto em que ele começou, se for o caso. */
type Finger = Point & { part?: 1 | 2 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Em qual trecho do texto (título 1, explicação 2) o dedo ou o cursor está, pela alça sobre ele. */
const partOf = (target: EventTarget | null): 1 | 2 | undefined => {
  const part = (target as Element | null)?.closest?.(".text-handle")?.getAttribute("data-part");
  return part === "1" ? 1 : part === "2" ? 2 : undefined;
};

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
  textSizes,
  onTextSize,
}: {
  source: PreviewSource;
  spec: FormatSpec;
  framing: Framing;
  overlay: Overlay | null;
  /** Largura inicial do canvas em pixels (a altura segue o formato); depois, segue a tela. */
  width: number;
  onFraming?: (f: Framing) => void;
  /** Tamanho do título e da explicação: a pinça (ou Ctrl + roda) em cima de um deles muda o dele, não o zoom. */
  textSizes?: [number, number];
  onTextSize?: (part: 1 | 2, size: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null);
  // dedos (ou o mouse) no quadro, e o começo da pinça
  const pointers = useRef(new Map<number, Finger>());
  const pinchStart = useRef<{ d: number; mid: Spot; start: Framing; part?: 1 | 2; size?: number } | null>(null);
  const pinching = useRef(false);
  // o enquadramento e o callback mais recentes, para o gesto e a roda do mouse não usarem valores velhos
  const latest = useRef({ framing, onFraming, textSizes, onTextSize });
  latest.current = { framing, onFraming, textSizes, onTextSize };
  const [fontsReady, setFontsReady] = useState(0);
  const [boxes, setBoxes] = useState<TextBox[]>([]);
  // a prévia com os pixels de verdade da tela (até a largura da foto final): em 1/3 deles, ela parece borrada no celular
  const [W, setW] = useState(width);
  useEffect(() => {
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const w = Math.round(Math.min(spec.w, c.clientWidth * (window.devicePixelRatio || 1)));
      if (w > 0) setW((prev) => (Math.abs(prev - w) > 8 ? w : prev));
    };
    const watcher = new ResizeObserver(fit);
    watcher.observe(c);
    fit();
    return () => watcher.disconnect();
  }, [spec.w]);
  const H = Math.round((W * spec.h) / spec.w);
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
    c.width = W;
    c.height = H;
    const layout = drawPost(c.getContext("2d")!, source.img, source.width, source.height, W, H, framing, overlay);
    const next = layout ? textBoxes(layout, W, H) : [];
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [source, W, H, framing, overlay, fontsReady]);

  // pinça do trackpad (chega como roda com Ctrl) ou Ctrl + roda do mouse; a roda sozinha continua rolando a página
  useEffect(() => {
    const el = surface.current;
    if (!el || !canPan) return;
    const onWheel = (e: WheelEvent) => {
      const { framing: f, onFraming: set, textSizes: sizes, onTextSize: setSize } = latest.current;
      if (!e.ctrlKey || !set) return;
      e.preventDefault();
      const factor = Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01);
      // em cima de um texto, muda o tamanho dele
      const part = partOf(e.target);
      if (part && sizes && setSize) {
        setSize(part, textSize(sizes[part - 1] * factor));
        return;
      }
      const r = el.getBoundingClientRect();
      const at = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      set(zoomAround(f, zoomOf(f) * factor, at, at));
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
      // o dedo que ficou continua arrastando a foto, a partir de onde ela está (se estava na foto)
      const rest = [...pointers.current.values()][0];
      drag.current = rest && !rest.part ? { x: rest.x, y: rest.y, start: latest.current.framing } : null;
    }
    if (!pointers.current.size) {
      drag.current = null;
      pinching.current = false;
    }
  };

  const surfaceHandlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (!canPan || (e.target as Element).closest("button")) return;
      const p: Finger = { x: e.clientX, y: e.clientY, part: partOf(e.target) };
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
      // segundo dedo: começa a pinça, e o arraste de um dedo (da foto, do texto ou da figurinha) para. Se o primeiro
      // dedo estava num texto, a pinça muda o tamanho dele; senão, o zoom da foto
      capture();
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      pinching.current = true;
      const part = textSizes && onTextSize ? a.part : undefined;
      pinchStart.current = {
        d: Math.max(1, distance(a, b)),
        mid: spotIn(e.currentTarget.getBoundingClientRect(), midOf(a, b)),
        start: framing,
        part,
        size: part ? textSizes![part - 1] : undefined,
      };
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
        const ratio = distance(a, b) / s.d;
        if (s.part && s.size !== undefined) onTextSize?.(s.part, textSize(s.size * ratio));
        else onFraming?.(zoomAround(s.start, zoomOf(s.start) * ratio, s.mid, spotIn(r, midOf(a, b))));
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
