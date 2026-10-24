// Fotos do post: abrir o arquivo, ler o EXIF e preparar a versão que vai para o Claude.
import { readExif } from "./exif";
import { DEFAULT_FRAMING, type Framing } from "./render";
import type { PhotoMeta } from "./types";

/** Fotos por post (o Instagram aceita até 20 num carrossel; 10 é o que o Claude analisa bem de uma vez). */
export const MAX_PHOTOS = 10;

export interface Photo {
  id: string;
  name: string;
  /** Endereço local do arquivo original, para as miniaturas. */
  url: string;
  img: HTMLImageElement;
  width: number;
  height: number;
  meta: PhotoMeta;
  framing: Framing;
}

let seq = 0;

/** Abre a imagem pelo onload, que funciona em todo navegador (o decode() falha à toa em alguns). */
function openImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error("imagem vazia")));
    img.onerror = () => reject(new Error("formato não suportado"));
    img.src = url;
  });
}

export async function loadPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await openImage(url);
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(file.name);
  }
  let meta: PhotoMeta = {};
  try {
    meta = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    // sem metadados
  }
  return {
    id: `foto-${Date.now().toString(36)}-${(seq++).toString(36)}`,
    name: file.name,
    url,
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    meta,
    framing: { ...DEFAULT_FRAMING },
  };
}

export function releasePhoto(p: Photo) {
  URL.revokeObjectURL(p.url);
}

/**
 * Pode ser imagem? Pelo tipo, pela extensão ou, quando o celular não informa nem uma coisa nem outra (acontece com
 * alguns apps de galeria), na dúvida sim: quem decide é a tentativa de abrir a imagem.
 */
export function isImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  if (/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f.name)) return true;
  return !f.type || f.type === "application/octet-stream";
}

const aiVersions = new WeakMap<HTMLImageElement, Promise<Blob>>();

/**
 * Versão reduzida (lado maior com até 1568 px) para enviar ao Claude: mais rápida e sem os dados do EXIF.
 * Fica guardada, para que o mesmo pedido mande exatamente os mesmos bytes.
 */
export function photoForAi(p: Photo): Promise<Blob> {
  let version = aiVersions.get(p.img);
  if (!version) {
    version = new Promise<Blob>((resolve, reject) => {
      const scale = Math.min(1, 1568 / Math.max(p.width, p.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(p.width * scale));
      canvas.height = Math.max(1, Math.round(p.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; // fundo para PNG com transparência
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(p.img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.86);
    });
    aiVersions.set(p.img, version);
  }
  return version;
}

/** Fotos com data e com localização gravadas, para avisar a pessoa antes de enviar. */
export function metaSummary(photos: Photo[]) {
  return {
    dated: photos.filter((p) => p.meta.takenAt).length,
    located: photos.filter((p) => p.meta.lat !== undefined).length,
  };
}
