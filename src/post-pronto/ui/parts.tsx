import { Check, Copy, Undo2, WandSparkles, X } from "lucide-react";
import { type CSSProperties, useEffect, useId, useState, type ReactNode } from "react";
import { cleanHashtags } from "../prompts";
import { copyText } from "../save";

/** Grupo de opções em que só uma fica marcada. */
export function Chips<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<K, string>;
  value: K;
  onChange: (v: K) => void;
}) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      <span className="label">{label}</span>
      <div className="chips">
        {(Object.keys(options) as K[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            className={`chip${value === k ? " on" : ""}`}
            onClick={() => onChange(k)}
          >
            {options[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botões lado a lado para poucas opções curtas. */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel,
  narrowColumns,
}: {
  label: string;
  options: { id: K; label: ReactNode; title?: string }[];
  /** null: nenhuma opção marcada (o valor atual fica entre elas). */
  value: K | null;
  onChange: (v: K) => void;
  hideLabel?: boolean;
  /** No celular, as opções em uma grade com este número de colunas. */
  narrowColumns?: number;
}) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      {!hideLabel && <span className="label">{label}</span>}
      <div
        className="segmented"
        data-cols={narrowColumns}
        style={narrowColumns ? ({ "--cols": narrowColumns } as CSSProperties) : undefined}
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            title={o.title}
            className={value === o.id ? "on" : ""}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

/** Botão que copia um texto e confirma por dois segundos. */
export function CopyButton({
  text,
  label = "Copiar",
  className = "btn secondary",
  onResult,
}: {
  text: string;
  label?: string;
  className?: string;
  onResult?: (ok: boolean) => void;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const ok = await copyText(text);
        setDone(ok);
        onResult?.(ok);
      }}
    >
      {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {done ? "Copiado" : label}
    </button>
  );
}

/** Círculo feito à mão com lápis dermatográfico, como nas folhas de contato. */
export function MarkerCircle() {
  return (
    <svg className="marker-circle" viewBox="0 0 120 60" aria-hidden="true" preserveAspectRatio="none">
      <path d="M62 6C30 4 6 14 5 30c-1 17 26 26 58 25 31-1 53-11 52-27C114 13 92 4 58 7c-9 1-17 3-24 6" />
    </svg>
  );
}

/** Hashtags como etiquetas removíveis, com campo para acrescentar (até `max`). */
export function TagEditor({ tags, max, onChange }: { tags: string[]; max: number; onChange: (tags: string[]) => void }) {
  const [tag, setTag] = useState("");
  const add = () => {
    if (!tag.trim()) return;
    onChange(cleanHashtags([...tags, tag], max));
    setTag("");
  };
  return (
    <div className="tag-editor">
      {tags.map((t) => (
        <span className="tag" key={t}>
          {t}
          <button type="button" aria-label={`Tirar ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
      {tags.length < max && (
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="#nova"
          aria-label="Adicionar hashtag"
          autoCapitalize="none"
        />
      )}
    </div>
  );
}

const parseOptions = (s: string) =>
  s
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);

/** Opções separadas por barra ("Sim / Não"), sem atrapalhar a digitação. */
export function OptionsInput({
  id,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  options: string[];
  onChange: (options: string[]) => void;
  placeholder: string;
}) {
  const joined = options.join(" / ");
  const [raw, setRaw] = useState(joined);
  useEffect(() => {
    // só reescreve o campo quando as opções mudaram por fora (um ajuste do Claude, por exemplo)
    setRaw((r) => (parseOptions(r).join(" / ") === joined ? r : joined));
  }, [joined]);
  return (
    <input
      id={id}
      value={raw}
      placeholder={placeholder}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(parseOptions(e.target.value));
      }}
    />
  );
}

/** Ajustes de um toque e pedido livre ao Claude, com desfazer. */
export function RefineBox({
  presets,
  onRefine,
  canUndo,
  onUndo,
  placeholder,
}: {
  presets: { label: string; instruction: string }[];
  /** Pede o ajuste; true se deu certo. */
  onRefine: (instruction: string) => Promise<boolean>;
  canUndo: boolean;
  onUndo: () => void;
  placeholder: string;
}) {
  const [custom, setCustom] = useState("");
  const ask = async () => {
    if (custom.trim() && (await onRefine(custom))) setCustom("");
  };
  return (
    <div className="field">
      <span className="label">Pedir um ajuste ao Claude</span>
      <div className="chips">
        {presets.map((p) => (
          <button key={p.label} type="button" className="chip" onClick={() => onRefine(p.instruction)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="inline-form">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ask();
            }
          }}
          placeholder={placeholder}
          aria-label="Pedido de ajuste"
        />
        <button type="button" className="btn secondary" disabled={!custom.trim()} onClick={ask}>
          <WandSparkles size={16} aria-hidden="true" /> Ajustar
        </button>
      </div>
      {canUndo && (
        <button type="button" className="btn ghost small" onClick={onUndo}>
          <Undo2 size={15} aria-hidden="true" /> Desfazer o último ajuste
        </button>
      )}
    </div>
  );
}
