import { describe, expect, it } from "vitest";
import { readExif } from "../../src/post-pronto/exif";

type Dms = [number, number, number];

/** Monta um JPEG mínimo com EXIF (data e GPS), na ordem de bytes pedida. */
function exifJpeg(o: { little: boolean; date?: string; lat?: Dms; latRef?: string; lon?: Dms; lonRef?: string }) {
  const tiff = new Uint8Array(178);
  const v = new DataView(tiff.buffer);
  const le = o.little;
  tiff.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    v.setUint16(at, tag, le);
    v.setUint16(at + 2, type, le);
    v.setUint32(at + 4, count, le);
    v.setUint32(at + 8, value, le);
  };
  const ascii = (at: number, s: string) => tiff.set([...s].map((c) => c.charCodeAt(0)), at);
  const dms = (at: number, [d, m, s]: Dms) => {
    [d, m, Math.round(s * 100)].forEach((num, i) => {
      v.setUint32(at + i * 8, num, le);
      v.setUint32(at + i * 8 + 4, i === 2 ? 100 : 1, le);
    });
  };
  // IFD0 (em 8): ponteiros para o IFD do EXIF (38) e do GPS (76)
  v.setUint16(8, 2, le);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 76);
  // IFD do EXIF: data em que a foto foi tirada, guardada em 56
  v.setUint16(38, 1, le);
  entry(40, 0x9003, 2, 20, 56);
  if (o.date) ascii(56, o.date);
  // IFD do GPS: referências curtas ficam dentro da própria entrada; graus/minutos/segundos em 130 e 154
  v.setUint16(76, o.lat ? 4 : 0, le);
  if (o.lat && o.lon) {
    entry(78, 1, 2, 2, 0);
    ascii(86, o.latRef ?? "N");
    entry(90, 2, 5, 3, 130);
    entry(102, 3, 2, 2, 0);
    ascii(110, o.lonRef ?? "E");
    entry(114, 4, 5, 3, 154);
    dms(130, o.lat);
    dms(154, o.lon);
  }
  const head = [0xff, 0xd8, 0xff, 0xe1, (tiff.length + 8) >> 8, (tiff.length + 8) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0];
  const jpeg = new Uint8Array(head.length + tiff.length + 2);
  jpeg.set(head, 0);
  jpeg.set(tiff, head.length);
  jpeg.set([0xff, 0xd9], head.length + tiff.length);
  return jpeg.buffer;
}

describe("readExif", () => {
  it("lê data e GPS em ordem de bytes do iPhone (big-endian), com sul e oeste negativos", () => {
    const meta = readExif(
      exifJpeg({ little: false, date: "2026:03:12 18:40:05", lat: [22, 57, 12.34], latRef: "S", lon: [43, 12, 37.75], lonRef: "W" }),
    );
    expect(meta).toEqual({ takenAt: "2026-03-12T18:40:05", lat: -22.953428, lon: -43.210486 });
  });

  it("lê em little-endian e hemisfério norte/leste", () => {
    const meta = readExif(exifJpeg({ little: true, date: "2025:12:31 23:59:58", lat: [48, 51, 29.6], lon: [2, 17, 40.2] }));
    expect(meta.takenAt).toBe("2025-12-31T23:59:58");
    expect(meta.lat).toBeCloseTo(48.858222, 5);
    expect(meta.lon).toBeCloseTo(2.294500, 5);
  });

  it("ignora coordenadas zeradas e datas vazias", () => {
    expect(readExif(exifJpeg({ little: true, date: "0000:00:00 00:00:00", lat: [0, 0, 0], lon: [0, 0, 0] }))).toEqual({});
  });

  it("devolve vazio para arquivos sem EXIF, cortados ou que não são JPEG", () => {
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toEqual({});
    expect(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({});
    const cut = exifJpeg({ little: true, date: "2026:03:12 18:40:05", lat: [1, 2, 3], lon: [4, 5, 6] }).slice(0, 60);
    expect(() => readExif(cut)).not.toThrow();
  });
});
