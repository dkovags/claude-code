import { ChevronLeft, ChevronRight, ImagePlus, TriangleAlert, X } from "lucide-react";
import { useId, useState, type DragEvent } from "react";
import { MAX_PHOTOS, type Photo } from "../photos";
import { ARTIFACT_URL, inClaude, mobileKind } from "../runtime";
import type { Destination } from "../types";
import { CopyButton } from "./parts";

/**
 * No celular, dentro do app do Claude, o seletor de fotos pode não abrir (acontece no app do Android). O mesmo link
 * aberto no navegador funciona, com a mesma conta. Quem já está no navegador não precisa do aviso.
 */
function OpenInBrowser() {
  const kind = mobileKind();
  if (!inClaude() || (kind !== "android-app" && kind !== "ios-app")) return null;
  return (
    <div className={`open-browser${kind === "android-app" ? " strong" : ""}`}>
      <p>
        {kind === "android-app" ? (
          <>
            <strong>No app do Claude para Android, o botão pode não abrir a galeria.</strong> Abra o Post Pronto no Chrome,
            entrando com a mesma conta do Claude:
          </>
        ) : (
          "Se o botão não abrir a galeria, abra o Post Pronto no navegador do celular, entrando com a mesma conta do Claude:"
        )}
      </p>
      <p className="open-browser-link">{ARTIFACT_URL}</p>
      <div className="actions">
        <CopyButton text={ARTIFACT_URL} label="Copiar link" className="btn secondary small" />
        <a className="btn ghost small" href={ARTIFACT_URL} target="_blank" rel="noreferrer">
          Abrir no navegador
        </a>
      </div>
    </div>
  );
}

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
  loading,
  error,
}: {
  photos: Photo[];
  destination: Destination;
  onAdd?: (files: File[]) => void;
  onMove?: (index: number, dir: -1 | 1) => void;
  onRemove?: (index: number) => void;
  /** Foto selecionada (para ajustar o enquadramento). */
  active?: number;
  onActive?: (index: number) => void;
  /** Fotos sendo abertas. */
  loading?: boolean;
  /** Problema com as fotos enviadas, mostrado logo abaixo delas. */
  error?: string | null;
}) {
  const inputId = useId();
  const phone = mobileKind() !== null;
  const [over, setOver] = useState(false);
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
  // o campo fica escondido só visualmente e é aberto pelo <label>: é o jeito que funciona em mais navegadores e apps
  const fileInput = onAdd && (
    <input
      id={inputId}
      className="file-input"
      type="file"
      accept="image/*"
      multiple
      disabled={loading}
      onChange={(e) => {
        onAdd(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );
  const problem = error && (
    <p className="upload-error" role="alert">
      <TriangleAlert size={16} aria-hidden="true" /> {error}
    </p>
  );

  if (!photos.length && onAdd) {
    return (
      <div className="photo-picker">
        <div className={`dropzone${over ? " over" : ""}`} {...dragProps}>
          <ImagePlus size={30} aria-hidden="true" />
          <p>
            <strong>{phone ? "Escolha as fotos na galeria" : "Arraste suas fotos para cá"}</strong>
          </p>
          {fileInput}
          <label htmlFor={inputId} className={`btn primary${loading ? " is-loading" : ""}`}>
            {loading ? "Abrindo as fotos…" : "Escolher fotos"}
          </label>
          <p className="hint">
            {destination === "stories"
              ? `Uma foto para cada tela do story, até ${MAX_PHOTOS} em sequência,`
              : `Uma foto ou até ${MAX_PHOTOS} para um carrossel (a primeira vira a capa),`}{" "}
            em JPG, PNG ou WebP.{!phone && " Também dá para colar uma imagem com Ctrl+V."}
          </p>
        </div>
        <OpenInBrowser />
        {problem}
      </div>
    );
  }

  return (
    <div className="photo-picker">
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
              <label htmlFor={inputId} className="thumb">
                <ImagePlus size={22} aria-hidden="true" />
                <span>{loading ? "Abrindo…" : "Adicionar"}</span>
              </label>
            </li>
          )}
        </ol>
      </div>
      {problem}
    </div>
  );
}
