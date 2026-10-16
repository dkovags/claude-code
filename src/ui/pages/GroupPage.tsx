import { ChartPie, Download, HandCoins, Receipt, RotateCcw, Scale, Settings, Sigma, Users } from "lucide-react";
import { groupKey, memberBalance } from "../../domain/balances";
import { expensesToCsv } from "../../domain/csv";
import { formatMoney } from "../../domain/money";
import { personName, who } from "../../domain/people";
import type { ID } from "../../domain/types";
import * as A from "../../store/actions";
import { Avatar, EmptyState, GroupAvatar, OweText } from "../components/basics";
import { ExpenseList } from "../components/ExpenseList";
import { MainActions, Page } from "../components/Shell";
import { useData, useRun, useUI } from "../context";
import { downloadFile, slug } from "../download";
import { GROUP_TYPES } from "../icons";

/** Saldo de cada membro (coluna da direita no computador, topo da página no celular). */
function GroupBalances({ groupId }: { groupId: ID | null }) {
  const { ds, ledger, me } = useData();
  const ui = useUI();
  const group = groupId ? ds.groups[groupId] : null;
  const members = group
    ? group.memberIds
    : [...new Set(ledger.active.filter((e) => !e.groupId).flatMap((e) => [...Object.keys(e.paidBy), ...Object.keys(e.owedBy)]))];
  return (
    <div className="side-card">
      <div className="side-title">{group ? "Saldos do grupo" : "Saldos"}</div>
      {members.map((id) => (
        <div className="member-balance" key={id}>
          <Avatar person={ds.people[id]} size={32} />
          <div>
            <div className="name">{id === me ? "Você" : personName(ds, id)}</div>
            <OweText
              balance={memberBalance(ledger, groupId, id)}
              preferred={group?.currency || ds.prefs.currency}
              owesYou="recebe"
              youOwe="deve"
              settled="quite"
            />
          </div>
        </div>
      ))}
      {group && (
        <button className="link-btn" onClick={() => ui.open({ type: "balances", groupId: group.id })}>
          Ver detalhes
        </button>
      )}
    </div>
  );
}

/** Resumo do celular: "Você recebe R$ X no total" e as dívidas que envolvem você. */
function MyGroupSummary({ groupId }: { groupId: ID | null }) {
  const { ds, ledger, me } = useData();
  const k = groupKey(groupId);
  const bal = ledger.myGroupBalance.get(k) || {};
  const debts = (ledger.debtsByGroup.get(k) || []).filter((d) => d.from === me || d.to === me);
  const group = groupId ? ds.groups[groupId] : null;
  return (
    <div className="group-summary">
      <div className="group-summary-total">
        <OweText
          balance={bal}
          preferred={group?.currency || ds.prefs.currency}
          owesYou="No total, você recebe"
          youOwe="No total, você deve"
          settled="Você está quite neste grupo."
        />
      </div>
      {debts.map((d, i) => (
        <div className="breakdown" key={i}>
          {d.to === me ? (
            <>
              {personName(ds, d.from)} deve a você <span className="pos">{formatMoney(d.amount, d.currency)}</span>
            </>
          ) : (
            <>
              Você deve a {personName(ds, d.to)} <span className="neg">{formatMoney(d.amount, d.currency)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Toolbar({ groupId }: { groupId: ID | null }) {
  const ui = useUI();
  const { ds, ledger } = useData();
  const group = groupId ? ds.groups[groupId] : null;
  const exportCsv = () => {
    const list = ledger.active.filter((e) => e.groupId === groupId);
    const csv = expensesToCsv(ds, list, group ? group.memberIds : undefined);
    downloadFile(`${slug(group?.name || "despesas-sem-grupo")}.csv`, csv, "text/csv;charset=utf-8");
  };
  return (
    <div className="toolbar">
      <button className="chip-btn orange" onClick={() => ui.open({ type: "settle", groupId })}>
        <HandCoins size={15} /> Acertar contas
      </button>
      {group && (
        <button className="chip-btn" onClick={() => ui.open({ type: "balances", groupId: group.id })}>
          <Scale size={15} /> Saldos
        </button>
      )}
      <button className="chip-btn" onClick={() => ui.open({ type: "totals", groupId })}>
        <Sigma size={15} /> Totais
      </button>
      <button className="chip-btn" onClick={() => ui.open({ type: "charts", groupId })}>
        <ChartPie size={15} /> Gráficos
      </button>
      <button className="chip-btn" onClick={exportCsv}>
        <Download size={15} /> Exportar
      </button>
      {group && (
        <button className="chip-btn" onClick={() => ui.open({ type: "group", groupId: group.id })}>
          <Settings size={15} /> Configurações
        </button>
      )}
    </div>
  );
}

export function GroupPage({ id }: { id: ID }) {
  const { ds, ledger, me } = useData();
  const ui = useUI();
  const runAction = useRun();
  const group = ds.groups[id];
  if (!group)
    return (
      <Page title="Grupo não encontrado">
        <EmptyState icon={<Users size={44} />} title="Este grupo não existe mais." />
      </Page>
    );
  const expenses = ledger.active.filter((e) => e.groupId === id);
  const typeLabel = GROUP_TYPES.find((t) => t.key === group.type)?.label;
  const notMember = !group.memberIds.includes(me);
  return (
    <Page
      title={group.name}
      icon={<GroupAvatar group={group} size={44} />}
      actions={!group.deletedAt && !notMember ? <MainActions groupId={id} /> : undefined}
      right={<GroupBalances groupId={id} />}
    >
      {group.deletedAt && (
        <div className="banner warn">
          Este grupo foi excluído por {who(ds, group.deletedBy || me)}.
          <button className="btn btn-mint btn-sm" onClick={() => runAction(A.restoreGroup, id)}>
            <RotateCcw size={14} /> Restaurar grupo
          </button>
        </div>
      )}
      {notMember && !group.deletedAt && <div className="banner info">Você não participa mais deste grupo.</div>}
      <div className="group-hero only-mobile">
        <GroupAvatar group={group} size={64} />
        <div>
          <div className="group-hero-name">{group.name}</div>
          <div className="muted small">
            {typeLabel} · {group.memberIds.length} {group.memberIds.length === 1 ? "pessoa" : "pessoas"}
          </div>
        </div>
      </div>
      <div className="narrow-only">
        <MyGroupSummary groupId={id} />
      </div>
      {!group.deletedAt && <Toolbar groupId={id} />}
      {expenses.length ? (
        <ExpenseList expenses={expenses} />
      ) : (
        <EmptyState icon={<Receipt size={44} />} title="Nenhuma despesa ainda">
          {group.deletedAt ? null : (
            <>
              Adicione a primeira despesa do grupo.
              <div className="empty-actions">
                <button className="btn btn-orange" onClick={() => ui.open({ type: "expense", groupId: id })}>
                  Adicionar uma despesa
                </button>
              </div>
            </>
          )}
        </EmptyState>
      )}
    </Page>
  );
}

export function NonGroupPage() {
  const { ledger } = useData();
  const ui = useUI();
  const expenses = ledger.active.filter((e) => !e.groupId);
  return (
    <Page title="Despesas sem grupo" icon={<GroupAvatar group={null} size={44} />} actions={<MainActions groupId={null} />} right={<GroupBalances groupId={null} />}>
      <div className="narrow-only">
        <MyGroupSummary groupId={null} />
      </div>
      <Toolbar groupId={null} />
      {expenses.length ? (
        <ExpenseList expenses={expenses} showGroup />
      ) : (
        <EmptyState icon={<Receipt size={44} />} title="Nenhuma despesa fora de grupos">
          <div className="empty-actions">
            <button className="btn btn-orange" onClick={() => ui.open({ type: "expense", groupId: null })}>
              Adicionar uma despesa
            </button>
          </div>
        </EmptyState>
      )}
    </Page>
  );
}
