import { UserMinus } from "lucide-react";
import { useState } from "react";
import { isZero } from "../../domain/money";
import type { ID } from "../../domain/types";
import * as A from "../../store/actions";
import { Modal } from "../components/basics";
import { useData, useRun, useStore, useUI } from "../context";
import { navigate } from "../router";

export function FriendDialog({ personId, email: initialEmail, onClose }: { personId?: ID; email?: string; onClose: () => void }) {
  const { ds, ledger, me } = useData();
  const runAction = useRun();
  const ui = useUI();
  const person = personId ? ds.people[personId] : undefined;
  const [name, setName] = useState(person?.name || "");
  const [email, setEmail] = useState(person?.email || initialEmail || "");
  const isMe = personId === me;
  // na nuvem o e-mail identifica a conta: o seu é o da conta Google, e o de um amigo não muda depois de cadastrado
  const emailLocked = useStore().mode === "cloud" && (isMe || !!person?.email);

  const save = () => {
    if (person) {
      const newId = runAction(A.updatePerson, person.id, { name, email });
      if (newId) {
        onClose();
        ui.toast(isMe ? "Perfil atualizado." : "Amigo atualizado.");
        if (newId !== person.id && !isMe) navigate(`/friends/${encodeURIComponent(newId)}`, { replace: true });
      }
      return;
    }
    const id = runAction(A.addPerson, { name, email });
    if (id) {
      onClose();
      ui.toast(`${name.trim()} foi adicionado(a) aos seus amigos.`);
      navigate(`/friends/${encodeURIComponent(id)}`);
    }
  };

  const balance = person ? ledger.friendBalance.get(person.id) || {} : {};

  return (
    <Modal
      title={isMe ? "Seu perfil" : person ? "Editar amigo" : "Adicionar amigo"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-gray" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-orange" onClick={save}>
            {person ? "Salvar" : "Adicionar amigo"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nome" />
        </label>
        <label className="field">
          <span>E-mail {isMe ? "" : "(opcional)"}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@exemplo.com"
            disabled={emailLocked}
          />
          {!isMe && (
            <small className="muted">
              O e-mail identifica a pessoa e permite que ela veja as despesas compartilhadas quando a sincronização na nuvem
              estiver ativa.
            </small>
          )}
        </label>
        <button type="submit" hidden />
      </form>
      {person && !isMe && !person.hidden && (
        <div className="danger-zone">
          <button
            className="btn btn-gray btn-sm"
            disabled={!isZero(balance)}
            title={isZero(balance) ? "" : "Acertem as contas antes de remover"}
            onClick={() =>
              ui.open({
                type: "confirm",
                title: "Remover amigo",
                message: `Remover ${person.name} da sua lista de amigos? As despesas antigas continuam no histórico.`,
                confirmLabel: "Remover",
                danger: true,
                onConfirm: () => {
                  if (runAction(A.setFriendHidden, person.id, true)) {
                    onClose();
                    navigate("/");
                  }
                },
              })
            }
          >
            <UserMinus size={14} /> Remover amigo
          </button>
        </div>
      )}
    </Modal>
  );
}
