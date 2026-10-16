import { LogOut, Trash2, X } from "lucide-react";
import { useState } from "react";
import { memberBalance } from "../../domain/balances";
import { CURRENCIES, formatBalance, isZero } from "../../domain/money";
import { personName, who } from "../../domain/people";
import type { GroupType, ID } from "../../domain/types";
import * as A from "../../store/actions";
import { Avatar, Modal, OweText, Toggle } from "../components/basics";
import { PeoplePicker } from "../components/PeoplePicker";
import { useData, useRun, useUI } from "../context";
import { GROUP_TYPES } from "../icons";
import { navigate } from "../router";

export function GroupDialog({ groupId, onClose }: { groupId?: ID; onClose: () => void }) {
  const { ds, ledger, me } = useData();
  const runAction = useRun();
  const ui = useUI();
  const group = groupId ? ds.groups[groupId] : undefined;
  const [name, setName] = useState(group?.name || "");
  const [type, setType] = useState<GroupType>(group?.type || "home");
  const [currency, setCurrency] = useState(group?.currency || ds.prefs.currency);
  const [simplify, setSimplify] = useState(group?.simplifyDebts ?? true);
  const [members, setMembers] = useState<ID[]>([]);

  const save = () => {
    if (group) {
      if (runAction(A.updateGroup, group.id, { name, type, currency, simplifyDebts: simplify })) {
        onClose();
        ui.toast("Grupo atualizado.");
      }
      return;
    }
    const id = runAction(A.createGroup, { name, type, currency, simplifyDebts: simplify, memberIds: members });
    if (id) {
      onClose();
      navigate(`/groups/${id}`);
      ui.toast("Grupo criado.");
    }
  };

  const memberIds = group ? group.memberIds : [me, ...members];

  const removeMember = (id: ID) => {
    if (!group) return setMembers(members.filter((x) => x !== id));
    const leaving = id === me;
    ui.open({
      type: "confirm",
      title: leaving ? "Sair do grupo" : "Remover membro",
      message: leaving
        ? `Tem certeza de que deseja sair de “${group.name}”?`
        : `Remover ${personName(ds, id)} de “${group.name}”?`,
      confirmLabel: leaving ? "Sair" : "Remover",
      danger: true,
      onConfirm: () => {
        if (runAction(A.removeMember, group.id, id) && leaving) {
          onClose();
          navigate("/");
        }
      },
    });
  };

  const deleteGroup = () =>
    group &&
    ui.open({
      type: "confirm",
      title: "Excluir grupo",
      message: `Excluir “${group.name}”? Todas as despesas do grupo deixam de contar nos saldos. Você pode restaurar o grupo depois, pela atividade recente.`,
      confirmLabel: "Excluir grupo",
      danger: true,
      onConfirm: () => {
        runAction(A.deleteGroup, group.id);
        onClose();
        navigate("/");
        ui.toast("Grupo excluído.", { action: { label: "Desfazer", onClick: () => runAction(A.restoreGroup, group.id) } });
      },
    });

  return (
    <Modal
      title={group ? "Configurações do grupo" : "Criar um novo grupo"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-gray" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-orange" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nome do grupo</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Apartamento, Viagem para Bonito" autoFocus={!group} />
      </label>

      <div className="field">
        <span>Tipo</span>
        <div className="type-options">
          {GROUP_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                className={`type-option ${type === t.key ? "selected" : ""}`}
                onClick={() => setType(t.key)}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span>Membros do grupo</span>
        <div className="member-list">
          {memberIds.map((id) => {
            const bal = group ? memberBalance(ledger, group.id, id) : {};
            const locked = group ? !isZero(bal) : id === me;
            return (
              <div className="member-row" key={id}>
                <Avatar person={ds.people[id]} size={30} />
                <span className="member-name">
                  {who(ds, id, true)}
                  {ds.people[id]?.email && <small className="muted"> {ds.people[id].email}</small>}
                </span>
                {group && (
                  <span className="member-bal">
                    <OweText balance={bal} preferred={group.currency} owesYou="recebe" youOwe="deve" settled="quite" />
                  </span>
                )}
                {!(id === me && !group) && (
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={locked}
                    title={
                      locked
                        ? `Não dá para remover: saldo de ${formatBalance(bal, { abs: true })} em aberto`
                        : id === me
                          ? "Sair do grupo"
                          : "Remover do grupo"
                    }
                    aria-label={id === me ? "Sair do grupo" : `Remover ${personName(ds, id)}`}
                    onClick={() => removeMember(id)}
                  >
                    {id === me ? <LogOut size={16} /> : <X size={16} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <PeoplePicker
          exclude={memberIds}
          placeholder="Adicionar pessoa (nome ou e-mail)"
          onPick={(id) => {
            if (group) runAction(A.addMembers, group.id, [id]);
            else setMembers((m) => [...m, id]);
          }}
        />
      </div>

      <details className="advanced" open={!!group}>
        <summary>Configurações avançadas</summary>
        <label className="field">
          <span>Moeda padrão</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="toggle-row">
          <div>
            <b>Simplificar dívidas do grupo</b>
            <div className="muted small">
              Junta as dívidas para que cada um pague o mínimo de vezes. Ex.: se Ana deve a Bia e Bia deve a Caio, Ana paga
              direto a Caio. O saldo de cada um não muda.
            </div>
          </div>
          <Toggle checked={simplify} onChange={setSimplify} label="Simplificar dívidas" />
        </div>
      </details>

      {group && (
        <div className="danger-zone">
          <button className="btn btn-gray btn-sm" onClick={() => removeMember(me)} disabled={!isZero(memberBalance(ledger, group.id, me))}>
            <LogOut size={14} /> Sair do grupo
          </button>
          <button className="btn btn-danger btn-sm" onClick={deleteGroup}>
            <Trash2 size={14} /> Excluir grupo
          </button>
        </div>
      )}
    </Modal>
  );
}
