import { Download, Receipt, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryFullLabel } from "../../domain/categories";
import { expensesToCsv } from "../../domain/csv";
import { formatDate } from "../../domain/dates";
import { formatInput, formatMoney } from "../../domain/money";
import { personName } from "../../domain/people";
import { EmptyState } from "../components/basics";
import { ExpenseList } from "../components/ExpenseList";
import { MainActions, Page } from "../components/Shell";
import { useData } from "../context";
import { downloadFile } from "../download";
import { navigate } from "../router";

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function AllExpenses({ q: initialQ }: { q?: string }) {
  const { ds, ledger, me } = useData();
  const [q, setQ] = useState(initialQ || "");
  const [onlyMine, setOnlyMine] = useState(false);
  const filtered = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return ledger.active.filter((e) => {
      if (onlyMine && !(me in e.paidBy) && !(me in e.owedBy)) return false;
      if (!terms.length) return true;
      const hay = norm(
        [
          e.payment ? "pagamento" : e.description,
          e.notes || "",
          categoryFullLabel(e.category),
          e.groupId ? ds.groups[e.groupId]?.name || "" : "",
          ...[...Object.keys(e.paidBy), ...Object.keys(e.owedBy)].map((id) => personName(ds, id)),
          formatMoney(e.cost, e.currency),
          formatInput(e.cost, e.currency),
          formatDate(e.date),
          ...e.comments.map((c) => c.text),
        ].join(" "),
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [ds, ledger, q, onlyMine, me]);

  return (
    <Page
      title="Todas as despesas"
      actions={<MainActions />}
      hideHeaderOnMobile
    >
      <div className="search-bar">
        <Search size={18} />
        <input
          type="search"
          placeholder="Buscar por descrição, pessoa, grupo, valor…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            navigate(e.target.value ? `/all?q=${encodeURIComponent(e.target.value)}` : "/all", { replace: true });
          }}
          autoFocus={!!initialQ}
          aria-label="Buscar despesas"
        />
      </div>
      <div className="filter-row">
        <label className="check">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Só as que envolvem
          você
        </label>
        <span className="muted small">
          {filtered.length} {filtered.length === 1 ? "item" : "itens"}
        </span>
        <button
          className="chip-btn"
          onClick={() => downloadFile("despesas.csv", expensesToCsv(ds, filtered), "text/csv;charset=utf-8")}
          disabled={!filtered.length}
        >
          <Download size={15} /> Exportar
        </button>
      </div>
      {filtered.length ? (
        <ExpenseList expenses={filtered} showGroup />
      ) : (
        <EmptyState icon={<Receipt size={44} />} title={q ? "Nada encontrado" : "Nenhuma despesa ainda"}>
          {q ? "Tente outras palavras." : "As despesas que você adicionar aparecem aqui."}
        </EmptyState>
      )}
    </Page>
  );
}
