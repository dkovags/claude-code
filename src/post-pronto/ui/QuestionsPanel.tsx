import { ArrowLeft, Sparkles } from "lucide-react";
import type { Suggestions } from "../types";

export function Seen({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="seen">
      <span className="label">O que o Claude viu</span>
      {text}
    </p>
  );
}

export function QuestionsPanel({
  result,
  answers,
  setAnswers,
  onSubmit,
  onSkip,
  onBack,
}: {
  result: Suggestions;
  answers: string[];
  setAnswers: (a: string[]) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const set = (i: number, value: string) => setAnswers(result.questions.map((_, j) => (j === i ? value : answers[j] ?? "")));
  return (
    <form
      className="panel-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h2>Só mais um pouco de contexto</h2>
      <Seen text={result.analysis} />
      <p className="lead">Responda o que souber. O que ficar em branco, o Claude resolve sem.</p>

      {result.questions.map((q, i) => (
        <div className="field question" key={i}>
          <label className="question-text" htmlFor={`pp-q${i}`}>
            {q.question}
          </label>
          {q.options.length > 0 && (
            <div className="chips">
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`chip${answers[i] === o ? " on" : ""}`}
                  aria-pressed={answers[i] === o}
                  onClick={() => set(i, answers[i] === o ? "" : o)}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <input
            id={`pp-q${i}`}
            value={answers[i] ?? ""}
            onChange={(e) => set(i, e.target.value)}
            placeholder="Ou escreva com suas palavras"
          />
        </div>
      ))}

      <div className="actions">
        <button type="submit" className="btn primary big">
          <Sparkles size={18} aria-hidden="true" /> Gerar legendas
        </button>
        <button type="button" className="btn secondary" onClick={onSkip}>
          Pular e gerar assim mesmo
        </button>
        <button type="button" className="btn ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar
        </button>
      </div>
    </form>
  );
}
