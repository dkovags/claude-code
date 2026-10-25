import { TriangleAlert } from "lucide-react";
import type { Photo } from "../photos";
import { type FormatSpec, type Framing, sharpness, upscale } from "../render";

/** "1 e 2", "1, 2 e 3". */
export const andList = (items: (string | number)[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
const orList = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;

/** O quanto a foto é ampliada no enquadramento e a nitidez que isso dá na imagem baixada. */
export function photoSharpness(p: Photo, spec: FormatSpec, framing: Framing = p.framing) {
  const factor = upscale(p.width, p.height, spec, framing);
  return { factor, level: sharpness(factor) };
}

/** Nitidez da foto que está sendo ajustada e, se ela for ficar borrada, o que fazer para melhorar. */
export function SharpnessNote({ photo, spec, label }: { photo: Photo; spec: FormatSpec; label: string }) {
  const { factor, level } = photoSharpness(photo, spec);
  const size = `${photo.width} × ${photo.height} pixels`;
  if (level === "ok") {
    return (
      <p className="hint">
        {label}: {size}, nítida neste enquadramento.
      </p>
    );
  }
  const fill = photo.framing.mode === "fill";
  const tips = [
    ...(fill && photo.framing.zoom > 1.05 ? ["diminua o zoom"] : []),
    ...(fill && photoSharpness(photo, spec, { ...photo.framing, mode: "fit" }).level === "ok" ? ["escolha Foto inteira"] : []),
    "use a foto original (não a recebida por mensagem nem uma tirada com zoom do celular)",
  ];
  return (
    <p className={`quality-note ${level}`} role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>
        {label} tem {size} e precisa ser ampliada {factor.toFixed(1).replace(".", ",")} vezes neste enquadramento: na
        imagem baixada, ela {level === "blurry" ? "vai ficar borrada" : "perde um pouco de nitidez"}. Para melhorar,{" "}
        {orList(tips)}.
      </span>
    </p>
  );
}
