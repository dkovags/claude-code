import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { currenciesOf, formatMoney, isZero } from "../../domain/money";
import { AVATAR_COLORS, initials } from "../../domain/people";
import type { Balance, Cents, Group, Person } from "../../domain/types";
import { groupTypeIcon } from "../icons";

export function Avatar({ person, size = 40 }: { person?: Person; size?: number }) {
  const color = AVATAR_COLORS[(person?.color ?? 9) % AVATAR_COLORS.length];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden="true"
    >
      {initials(person?.name || "?")}
    </span>
  );
}

const GROUP_GRADIENTS = [
  ["#5bc5a7", "#2f9e83"],
  ["#ff8a5c", "#ff652f"],
  ["#8a7fe0", "#5b4ec4"],
  ["#5aa9e6", "#2f7fc1"],
  ["#f4bf4f", "#e39b17"],
  ["#e86d93", "#c9466f"],
  ["#4dbcc6", "#26939c"],
  ["#8fa1b3", "#5f7387"],
];

export function GroupAvatar({ group, size = 40 }: { group?: Group | null; size?: number }) {
  let h = 0;
  for (const ch of group?.id || "x") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = group ? GROUP_GRADIENTS[h % GROUP_GRADIENTS.length] : ["#b5bcc4", "#8e979f"];
  const Icon = groupTypeIcon(group?.type || "other");
  return (
    <span
      className="group-avatar"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.5)} color="#fff" strokeWidth={2} />
    </span>
  );
}

/** Valor colorido: verde quando é a receber, laranja quando é a pagar. */
export function Amount({ cents, currency, signed }: { cents: Cents; currency: string; signed?: boolean }) {
  const cls = cents > 0 ? "pos" : cents < 0 ? "neg" : "zero";
  return <span className={`amount ${cls}`}>{formatMoney(cents, currency, { abs: !signed })}</span>;
}

/** Saldo em várias moedas: "R$ 10,00 + US$ 5,00", com cor por sinal. */
export function BalanceAmounts({ balance, preferred, signed }: { balance: Balance; preferred?: string; signed?: boolean }) {
  const cs = currenciesOf(balance, preferred);
  if (!cs.length) return <span className="amount zero">{formatMoney(0, preferred || "BRL")}</span>;
  return (
    <>
      {cs.map((c, i) => (
        <span key={c}>
          {i > 0 && <span className="plus"> + </span>}
          <Amount cents={balance[c]} currency={c} signed={signed} />
        </span>
      ))}
    </>
  );
}

/**
 * Linha "você deve R$ X" / "deve a você R$ X" / "quite" a partir de um saldo
 * (positivo: a outra parte deve a você).
 */
export function OweText({
  balance,
  preferred,
  owesYou = "deve a você",
  youOwe = "você deve",
  settled = "quite",
}: {
  balance: Balance;
  preferred?: string;
  owesYou?: string;
  youOwe?: string;
  settled?: string;
}) {
  if (isZero(balance)) return <span className="muted">{settled}</span>;
  const cs = currenciesOf(balance, preferred);
  const pos = cs.filter((c) => balance[c] > 0);
  const neg = cs.filter((c) => balance[c] < 0);
  return (
    <span className="owe-text">
      {pos.length > 0 && (
        <span className="pos">
          {owesYou}{" "}
          <b>{pos.map((c) => formatMoney(balance[c], c, { abs: true })).join(" + ")}</b>
        </span>
      )}
      {pos.length > 0 && neg.length > 0 && <br />}
      {neg.length > 0 && (
        <span className="neg">
          {youOwe}{" "}
          <b>{neg.map((c) => formatMoney(balance[c], c, { abs: true })).join(" + ")}</b>
        </span>
      )}
    </span>
  );
}

/* Pilha de modais abertos: Esc fecha só o de cima e a rolagem da página fica travada enquanto houver algum. */
const modalStack: { close: () => void }[] = [];
if (typeof window !== "undefined")
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalStack.length) modalStack[modalStack.length - 1].close();
  });

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  className = "",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const item = { close: () => closeRef.current() };
    modalStack.push(item);
    document.body.classList.add("modal-open");
    return () => {
      const i = modalStack.indexOf(item);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.classList.remove("modal-open");
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="icon-btn light" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}
