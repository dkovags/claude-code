import { CircleStop, Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_MODELS, type ApiModel, type ApiSettings } from "../ai";
import { touchScreen } from "../runtime";

/**
 * A imagem da página pronta: dá para baixar e, se o download não funcionar nesta tela, salvar tocando e segurando a
 * imagem (no computador, com o botão direito).
 */
export function CaptureDialog({
  url,
  onSave,
  onShare,
  onClose,
}: {
  url: string;
  onSave?: () => void;
  onShare?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const press = touchScreen() ? "toque e segure a imagem" : "clique na imagem com o botão direito";
  return (
    <div className="overlay" data-capture="skip" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog capture-dialog" role="dialog" aria-modal="true" aria-labelledby="pp-capture-title">
        <h2 id="pp-capture-title">Imagem da tela</h2>
        <p>
          A página inteira numa imagem só. {onSave ? "Baixe a imagem ou, se o download não funcionar, " : "Para salvar, "}
          {press} e escolha salvar ou compartilhar.
        </p>
        <div className="capture-image">
          <img src={url} alt="Imagem da página inteira do Post Pronto" />
        </div>
        <div className="actions">
          {onSave && (
            <button type="button" className="btn primary" onClick={onSave}>
              <Download size={16} aria-hidden="true" /> Baixar imagem
            </button>
          )}
          {onShare && (
            <button type="button" className="btn secondary" onClick={onShare}>
              <Share2 size={16} aria-hidden="true" /> Compartilhar
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Enquanto o Claude trabalha: o que está acontecendo, há quanto tempo e um botão para parar. */
export function Busy({
  label,
  writingLabel,
  chars,
  expected,
  started,
  onStop,
}: {
  label: string;
  writingLabel: string;
  /** Caracteres da resposta que já chegaram. */
  chars: number;
  /** Tamanho aproximado da resposta, para a barra de progresso. */
  expected: number;
  started: number;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.round((now - started) / 1000));
  const writing = chars > 0;
  const pct = writing ? Math.min(96, 12 + (chars / expected) * 84) : Math.min(12, 2 + seconds / 3);
  return (
    <div className="busy" role="status" aria-live="polite">
      <div className="busy-card">
        <span className="spinner" aria-hidden="true" />
        <p className="busy-label">{writing ? writingLabel : label}…</p>
        <p className="hint">
          {writing ? "Já está chegando." : "Costuma levar de 10 segundos a 1 minuto."}{" "}
          <span className="busy-time">{seconds} s</span>
        </p>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <button type="button" className="btn secondary" onClick={onStop}>
          <CircleStop size={16} aria-hidden="true" /> Parar
        </button>
      </div>
    </div>
  );
}

/** Chave da API da Anthropic, para usar o Post Pronto fora do Claude. */
export function SettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: ApiSettings;
  onSave: (s: ApiSettings) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(settings.key);
  const [model, setModel] = useState<ApiModel>(settings.model);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-settings-title"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ key: key.trim(), model });
        }}
      >
        <h2 id="pp-settings-title">Acesso ao Claude</h2>
        <p>
          Aberto dentro do Claude (claude.ai ou app), o Post Pronto usa a sua conta e não precisa de nada aqui. Fora dele,
          usa a API da Anthropic com uma chave sua, e o uso é cobrado na conta da API.
        </p>
        <div className="field">
          <label className="label" htmlFor="pp-key">
            Chave da API
          </label>
          <div className="inline-form">
            <input
              id="pp-key"
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              autoFocus
            />
            <button type="button" className="btn ghost" onClick={() => setShow(!show)}>
              {show ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          <p className="hint">
            Crie a chave no{" "}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">
              Claude Console
            </a>
            . Ela fica guardada só neste navegador e vai direto para a Anthropic. Não salve a chave em computador
            compartilhado.
          </p>
        </div>
        <div className="field">
          <label className="label" htmlFor="pp-model">
            Modelo
          </label>
          <select id="pp-model" value={model} onChange={(e) => setModel(e.target.value as ApiModel)}>
            {API_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <button type="submit" className="btn primary">
            Salvar
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          {settings.key && (
            <button type="button" className="btn ghost danger" onClick={() => onSave({ key: "", model })}>
              Apagar a chave
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
