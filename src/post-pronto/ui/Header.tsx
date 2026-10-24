import { KeyRound } from "lucide-react";
import type { Destination } from "../types";

export type Step = "brief" | "questions" | "captions" | "finish";

const STEPS: { id: Step; label: string }[] = [
  { id: "brief", label: "Fotos e contexto" },
  { id: "questions", label: "Perguntas" },
  { id: "captions", label: "Textos" },
  { id: "finish", label: "Pronto para postar" },
];

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="logo-bg" />
      <path d="M9 13V9h4M23 13V9h-4M9 19v4h4M23 19v4h-4" className="logo-marks" />
      <circle cx="16" cy="16" r="3.2" className="logo-dot" />
    </svg>
  );
}

export function Header({
  destination,
  step,
  reachable,
  onStep,
  onSettings,
}: {
  destination: Destination;
  step: Step;
  reachable: Record<Step, boolean>;
  onStep: (s: Step) => void;
  /** Só fora do Claude, onde a pessoa usa a própria chave da API. */
  onSettings?: () => void;
}) {
  return (
    <header className="top">
      <div className="brand">
        <Logo />
        <div>
          <h1>Post Pronto</h1>
          <p className="tagline">
            {destination === "stories"
              ? "Das suas fotos para os stories, com texto, figurinhas, música e localização"
              : "Das suas fotos para o feed, com legenda, música e localização"}
          </p>
        </div>
        {onSettings && (
          <button type="button" className="btn ghost settings" onClick={onSettings}>
            <KeyRound size={16} aria-hidden="true" /> Configurar
          </button>
        )}
      </div>
      <nav aria-label="Etapas">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`step${step === s.id ? " current" : ""}`}
                aria-current={step === s.id ? "step" : undefined}
                disabled={!reachable[s.id] || step === s.id}
                onClick={() => onStep(s.id)}
              >
                <span className="num">{i + 1}</span>
                <span className="step-label">
                  {s.id === "captions" && destination === "feed" ? "Legenda" : s.label}
                  {s.id === "questions" && !reachable.questions && <small> (se precisar)</small>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  );
}
