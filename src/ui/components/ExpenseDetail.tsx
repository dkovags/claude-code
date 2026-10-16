import { Pencil, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { participants } from "../../domain/balances";
import { categoryFullLabel } from "../../domain/categories";
import { formatDateLong, relativeTime } from "../../domain/dates";
import { formatMoney } from "../../domain/money";
import { personName, who } from "../../domain/people";
import { REPEAT_LABELS, nextOccurrence } from "../../domain/recurring";
import type { ID } from "../../domain/types";
import * as A from "../../store/actions";
import { useData, useRun, useUI } from "../context";
import { CategoryIcon } from "../icons";
import { href } from "../router";
import { Avatar } from "./basics";
import { paymentText } from "./ExpenseList";

const SPLIT_LABELS: Record<string, string> = {
  equal: "dividido igualmente",
  exact: "dividido por valores exatos",
  percent: "dividido por porcentagens",
  shares: "dividido por partes",
  adjust: "dividido com ajustes",
};

export function ExpenseDetail({ expenseId, onDone }: { expenseId: ID; onDone?: () => void }) {
  const { ds, me } = useData();
  const ui = useUI();
  const runAction = useRun();
  const [comment, setComment] = useState("");
  const e = ds.expenses[expenseId];
  if (!e) return <div className="detail-missing">Despesa não encontrada.</div>;
  const group = e.groupId ? ds.groups[e.groupId] : null;
  const created = e.history.find((h) => h.type === "created");
  const ids = participants(e);
  const comments = e.comments.filter((c) => !c.deletedAt);
  const next = nextOccurrence(e);

  const edit = () => {
    if (e.payment) ui.open({ type: "settle", paymentId: e.id });
    else ui.open({ type: "expense", expenseId: e.id });
  };
  const remove = () =>
    ui.open({
      type: "confirm",
      title: e.payment ? "Excluir pagamento" : "Excluir despesa",
      message: e.payment
        ? "Tem certeza de que deseja excluir este pagamento?"
        : `Tem certeza de que deseja excluir “${e.description}”? Ela sairá dos saldos de todos.`,
      confirmLabel: "Excluir",
      danger: true,
      onConfirm: () => {
        runAction(A.deleteExpense, e.id);
        onDone?.();
        ui.toast(e.payment ? "Pagamento excluído." : "Despesa excluída.", {
          action: { label: "Desfazer", onClick: () => runAction(A.restoreExpense, e.id) },
        });
      },
    });
  const send = () => {
    if (!comment.trim()) return;
    if (runAction(A.addComment, e.id, comment) !== undefined) setComment("");
  };

  return (
    <div className="expense-detail">
      {e.deletedAt && (
        <div className="banner warn">
          Esta {e.payment ? "transação" : "despesa"} foi excluída por {who(ds, e.deletedBy || me)} {relativeTime(e.deletedAt)}.
          <button className="btn btn-mint btn-sm" onClick={() => runAction(A.restoreExpense, e.id)}>
            <RotateCcw size={14} /> Restaurar
          </button>
        </div>
      )}
      <div className="detail-head">
        <CategoryIcon category={e.category} size={64} />
        <div className="detail-title">
          <div className="detail-desc">{e.payment ? "Pagamento" : e.description}</div>
          <div className="detail-cost">{formatMoney(e.cost, e.currency)}</div>
          <div className="detail-meta">
            {created && created.auto
              ? `Criada automaticamente (recorrente) em ${formatDateLong(e.date)}`
              : `Adicionada por ${who(ds, e.createdBy)} ${relativeTime(e.createdAt)}`}
            {e.updatedAt && e.updatedBy && (
              <>
                <br />
                Atualizada por {who(ds, e.updatedBy)} {relativeTime(e.updatedAt)}
              </>
            )}
          </div>
          {!e.deletedAt && (
            <div className="detail-actions">
              <button className="btn btn-orange btn-sm" onClick={edit}>
                <Pencil size={14} /> Editar {e.payment ? "pagamento" : "despesa"}
              </button>
              <button className="btn btn-gray btn-sm" onClick={remove} aria-label="Excluir">
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="detail-cols">
        <div className="detail-left">
          <div className="detail-facts">
            <div>
              <b>Data:</b> {formatDateLong(e.date)}
            </div>
            {!e.payment && (
              <div>
                <b>Categoria:</b> {categoryFullLabel(e.category)}
              </div>
            )}
            <div>
              <b>Grupo:</b>{" "}
              {group ? <a href={href(`/groups/${group.id}`)}>{group.name}</a> : <span>sem grupo</span>}
            </div>
            {e.repeat !== "never" && (
              <div>
                <Repeat size={13} /> <b>Repete:</b> {REPEAT_LABELS[e.repeat].toLowerCase()}
                {next && !e.repeatDone && <> (próxima em {formatDateLong(next)})</>}
              </div>
            )}
          </div>
          {e.payment ? (
            <div className="detail-people">
              <div className="person-line">
                <Avatar person={ds.people[Object.keys(e.paidBy)[0]]} size={30} />
                <span>{paymentText(ds, e)}</span>
              </div>
            </div>
          ) : (
            <div className="detail-people">
              <div className="detail-split-label">Pago por {payerList(e.paidBy, ds)} e {SPLIT_LABELS[e.splitMode]}.</div>
              {ids.map((id) => {
                const paid = e.paidBy[id] || 0;
                const owed = e.owedBy[id] || 0;
                return (
                  <div className="person-line" key={id}>
                    <Avatar person={ds.people[id]} size={30} />
                    <span>
                      <b>{who(ds, id, true)}</b>{" "}
                      {paid > 0 && (
                        <>
                          pagou <b>{formatMoney(paid, e.currency)}</b>
                          {owed > 0 ? " e " : ""}
                        </>
                      )}
                      {owed > 0 && (
                        <>
                          deve <b>{formatMoney(owed, e.currency)}</b>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="detail-right">
          <div className="section-title">Observações e comentários</div>
          {e.notes && <div className="notes">{e.notes}</div>}
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="comment-head">
                <b>{personName(ds, c.by)}</b>
                <span className="muted"> · {relativeTime(c.ts)}</span>
                {c.by === me && (
                  <button
                    className="link-btn danger"
                    onClick={() => runAction(A.deleteComment, e.id, c.id)}
                    aria-label="Apagar comentário"
                  >
                    apagar
                  </button>
                )}
              </div>
              <div className="comment-text">{c.text}</div>
            </div>
          ))}
          <textarea
            className="comment-input"
            placeholder="Adicionar um comentário"
            value={comment}
            onChange={(ev) => setComment(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) send();
            }}
            rows={2}
          />
          <button className="btn btn-orange btn-sm" onClick={send} disabled={!comment.trim()}>
            Comentar
          </button>
        </div>
      </div>

      {e.history.length > 0 && (
        <details className="history">
          <summary>Histórico de alterações</summary>
          <ul>
            {e.history.map((h, i) => (
              <li key={i}>
                <span className="muted">{relativeTime(h.ts)}</span> – {historyText(h.type, who(ds, h.by, true), !!h.auto)}
                {h.changes && h.changes.length > 0 && <>: {h.changes.join("; ")}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function payerList(paidBy: Record<ID, number>, ds: ReturnType<typeof useData>["ds"]): string {
  const ids = Object.keys(paidBy);
  if (ids.length === 1) return who(ds, ids[0]);
  return `${ids.length} pessoas`;
}

function historyText(type: string, name: string, auto: boolean): string {
  if (auto) return "criada automaticamente (despesa recorrente)";
  switch (type) {
    case "created":
      return `${name} adicionou`;
    case "updated":
      return `${name} alterou`;
    case "deleted":
      return `${name} excluiu`;
    case "restored":
      return `${name} restaurou`;
    default:
      return name;
  }
}
