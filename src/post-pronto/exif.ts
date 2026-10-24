// Leitura mínima do EXIF de fotos JPEG: data em que a foto foi tirada e coordenadas GPS.
// Celulares costumam apagar o GPS ao enviar fotos pelo navegador; quando ele existe, ajuda a sugerir a localização.
import type { PhotoMeta } from "./types";

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 13: 4 };

interface Entry {
  type: number;
  count: number;
  /** Onde estão os dados, contado a partir do início do bloco TIFF. */
  at: number;
}

/** Lê os dados de uma foto JPEG (bastam os primeiros 128 KB do arquivo). Devolve {} se não houver EXIF. */
export function readExif(buffer: ArrayBuffer): PhotoMeta {
  try {
    const v = new DataView(buffer);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off + 4 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) return {};
      const marker = v.getUint8(off + 1);
      if (marker === 0xff) {
        off++; // byte de preenchimento
        continue;
      }
      if (marker === 0xda || marker === 0xd9) return {}; // começou a imagem: não há mais metadados
      const size = v.getUint16(off + 2);
      if (marker === 0xe1 && off + 10 <= v.byteLength && ascii(v, off + 4, 6) === "Exif") {
        return readTiff(new DataView(buffer, off + 10, Math.min(size - 8, v.byteLength - off - 10)));
      }
      off += 2 + size;
    }
  } catch {
    // arquivo cortado ou EXIF malformado
  }
  return {};
}

function ascii(v: DataView, at: number, len: number): string {
  let s = "";
  for (let i = 0; i < len && at + i < v.byteLength; i++) {
    const c = v.getUint8(at + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readTiff(t: DataView): PhotoMeta {
  const order = t.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return {};
  const little = order === 0x4949;
  const u16 = (at: number) => t.getUint16(at, little);
  const u32 = (at: number) => t.getUint32(at, little);
  if (u16(2) !== 42) return {};

  const ifd = (start: number): Map<number, Entry> => {
    const entries = new Map<number, Entry>();
    if (!start || start + 2 > t.byteLength) return entries;
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > t.byteLength) break;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const bytes = (TYPE_SIZES[type] ?? 1) * count;
      entries.set(u16(e), { type, count, at: bytes <= 4 ? e + 8 : u32(e + 8) });
    }
    return entries;
  };
  const str = (e?: Entry) => (e && e.type === 2 ? ascii(t, e.at, e.count) : "");
  const long = (e?: Entry) => {
    if (!e) return 0;
    if (e.type === 3) return u16(e.at);
    return e.type === 4 || e.type === 13 ? u32(e.at) : 0;
  };
  const rationals = (e?: Entry) => {
    if (!e || e.type !== 5 || e.count < 3) return null;
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const den = u32(e.at + i * 8 + 4);
      out.push(den ? u32(e.at + i * 8) / den : 0);
    }
    return out;
  };

  const meta: PhotoMeta = {};
  const ifd0 = ifd(u32(4));
  const exif = ifd(long(ifd0.get(TAG_EXIF_IFD)));
  const takenAt = parseExifDate(str(exif.get(TAG_DATETIME_ORIGINAL)) || str(ifd0.get(TAG_DATETIME)));
  if (takenAt) meta.takenAt = takenAt;

  const gps = ifd(long(ifd0.get(TAG_GPS_IFD)));
  const lat = rationals(gps.get(2));
  const lon = rationals(gps.get(4));
  if (lat && lon) {
    const sign = (ref: string, neg: string) => (ref.toUpperCase().startsWith(neg) ? -1 : 1);
    const la = sign(str(gps.get(1)), "S") * (lat[0] + lat[1] / 60 + lat[2] / 3600);
    const lo = sign(str(gps.get(3)), "W") * (lon[0] + lon[1] / 60 + lon[2] / 3600);
    // alguns aparelhos gravam 0,0 quando não têm sinal
    if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) {
      meta.lat = Math.round(la * 1e6) / 1e6;
      meta.lon = Math.round(lo * 1e6) / 1e6;
    }
  }
  return meta;
}

/** "2026:03:12 18:40:05" → "2026-03-12T18:40:05". */
function parseExifDate(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m || m[1] === "0000") return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
