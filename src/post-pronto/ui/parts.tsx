import { Check, Copy } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
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
}: {
  label: string;
  options: { id: K; label: ReactNode; title?: string }[];
  value: K;
  onChange: (v: K) => void;
  hideLabel?: boolean;
}) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      {!hideLabel && <span className="label">{label}</span>}
      <div className="segmented">
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
