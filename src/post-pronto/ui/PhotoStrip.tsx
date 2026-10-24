import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { MAX_PHOTOS, type Photo } from "../photos";
import type { Destination } from "../types";

/**
 * As fotos do post numa tira de filme, na ordem em que vão aparecer (o número de cada quadro é a posição:
 * a tela do story ou o lugar no carrossel). Sem fotos, vira a área para arrastar ou escolher arquivos.
 */
export function PhotoStrip({
  photos,
  destination,
  onAdd,
  onMove,
  onRemove,
  active,
  onActive,
}: {
  photos: Photo[];
  destination: Destination;
  onAdd?: (files: File[]) => void;
  onMove?: (index: number, dir: -1 | 1) => void;
  onRemove?: (index: number) => void;
  /** Foto selecionada (para ajustar o enquadramento). */
  active?: number;
  onActive?: (index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => input.current?.click();
  const dragProps = onAdd
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setOver(false);
          onAdd(Array.from(e.dataTransfer.files));
        },
      }
    : {};
  const fileInput = onAdd && (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      hidden
      aria-label="Escolher fotos"
      onChange={(e) => {
        onAdd(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );

  if (!photos.length && onAdd) {
    return (
      <div className={`dropzone${over ? " over" : ""}`} {...dragProps}>
        {fileInput}
        <ImagePlus size={30} aria-hidden="true" />
        <p>
          <strong>Arraste suas fotos para cá</strong>
        </p>
        <button type="button" className="btn primary" onClick={pick}>
          Escolher fotos
        </button>
        <p className="hint">
          {destination === "stories"
            ? `Uma foto para cada tela do story, até ${MAX_PHOTOS} em sequência,`
            : `Uma foto ou até ${MAX_PHOTOS} para um carrossel (a primeira vira a capa),`}{" "}
          em JPG, PNG ou WebP. Também dá para colar uma imagem com Ctrl+V.
        </p>
      </div>
    );
  }

  return (
    <div className={`film${over ? " over" : ""}`} {...dragProps}>
      {fileInput}
      <ol className="frames">
        {photos.map((p, i) => {
          const cover = destination === "feed" && i === 0;
          return (
            <li key={p.id} className={`frame${cover ? " cover" : ""}${onActive && active === i ? " active" : ""}`}>
              <button
                type="button"
                className="thumb"
                disabled={!onActive}
                aria-pressed={onActive ? active === i : undefined}
                aria-label={destination === "stories" ? `Tela ${i + 1}` : `Foto ${i + 1}${cover ? ", capa" : ""}`}
                onClick={() => onActive?.(i)}
              >
                <img src={p.url} alt="" />
              </button>
              <span className="frame-no">
                {i + 1}
                <span aria-hidden="true"> ▸</span>
                {cover && (
                  <span className="cover-mark" aria-hidden="true">
                    capa
                  </span>
                )}
              </span>
              {(onMove || onRemove) && (
                <span className="frame-tools">
                  <button
                    type="button"
                    aria-label={`Mover a foto ${i + 1} para a esquerda`}
                    disabled={i === 0}
                    onClick={() => onMove?.(i, -1)}
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Tirar a foto ${i + 1}`} onClick={() => onRemove?.(i)}>
                    <X size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Mover a foto ${i + 1} para a direita`}
                    disabled={i === photos.length - 1}
                    onClick={() => onMove?.(i, 1)}
                  >
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
        {onAdd && photos.length < MAX_PHOTOS && (
          <li className="frame add">
            <button type="button" className="thumb" onClick={pick}>
              <ImagePlus size={22} aria-hidden="true" />
              <span>Adicionar</span>
            </button>
          </li>
        )}
      </ol>
    </div>
  );
}
