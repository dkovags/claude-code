import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, makeZip } from "../../src/post-pronto/zip";

/** Lê o diretório central do zip e devolve nome e conteúdo de cada arquivo. */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const files: { name: string; data: Uint8Array; crc: number; utf8: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true);
    files.push({ name, data: zip.subarray(start, start + size), crc, utf8: (v.getUint16(at + 8, true) & 0x800) !== 0 });
    at += 46 + nameLen;
  }
  return files;
}

describe("zip", () => {
  it("calcula o CRC-32 igual ao do Node", () => {
    const data = new TextEncoder().encode("Post Pronto – legenda com acentuação");
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("guarda os arquivos com nomes em UTF-8", () => {
    const foto = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const txt = new TextEncoder().encode("LEGENDA\nOlá\n");
    const files = readZip(makeZip([
      { name: "post-pronto-1.jpg", data: foto },
      { name: "legenda e música.txt", data: txt },
    ]));
    expect(files.map((f) => f.name)).toEqual(["post-pronto-1.jpg", "legenda e música.txt"]);
    expect([...files[0].data]).toEqual([...foto]);
    expect(new TextDecoder().decode(files[1].data)).toBe("LEGENDA\nOlá\n");
    expect(files.every((f) => f.utf8 && f.crc === crc32(f.data))).toBe(true);
  });
});
