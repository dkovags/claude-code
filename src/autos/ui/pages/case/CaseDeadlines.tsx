import { CalendarPlus, ClipboardPaste, ListChecks } from "lucide-react";
import { useState } from "react";
import { noticesOfCase, tasksOfCase } from "../../../domain/select";
import type { Case } from "../../../domain/types";
import { Empty } from "../../components/basics";
import { NoticeCard, TaskCard } from "../../components/Cards";
import { useData, useUI } from "../../context";

export function CaseDeadlines({ c }: { c: Case }) {
  const ds = useData();
  const ui = useUI();
  const [showClosed, setShowClosed] = useState(false);
  const tasks = tasksOfCase(ds, c.id);
  const notices = noticesOfCase(ds, c.id);
  const openTasks = tasks.filter((t) => t.status === "pendente" || t.status === "elaboracao");
  const openNotices = notices.filter((n) => n.status === "aberto");
  const closed = tasks.length - openTasks.length + notices.length - openNotices.length;
  return (
    <div className="tab-body">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => ui.open({ type: "notice", caseId: c.id })}>
          <CalendarPlus size={17} /> Novo expediente
        </button>
        <button className="btn btn-ghost" onClick={() => ui.open({ type: "notice", caseId: c.id, text: "" })}>
          <ClipboardPaste size={17} /> Colar intimação
        </button>
        <button className="btn btn-ghost" onClick={() => ui.open({ type: "task", caseId: c.id })}>
          <ListChecks size={17} /> Nova providência
        </button>
      </div>
      {!tasks.length && !notices.length && (
        <Empty icon={<CalendarPlus size={28} />} title="Nenhum expediente registrado">
          Registre as intimações, citações e notificações de cada parte. O Autos calcula o prazo, diz se é preciso peticionar e lista os documentos para
          instruir a petição.
        </Empty>
      )}
      {openTasks.length > 0 && (
        <section className="section">
          <h3 className="section-title">Providências a fazer</h3>
          {openTasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </section>
      )}
      {openNotices.length > 0 && (
        <section className="section">
          <h3 className="section-title">Expedientes em aberto</h3>
          {openNotices.map((n) => (
            <NoticeCard key={n.id} notice={n} />
          ))}
        </section>
      )}
      {closed > 0 && (
        <section className="section">
          <button className="link-btn" onClick={() => setShowClosed(!showClosed)}>
            {showClosed ? "Esconder" : "Mostrar"} os concluídos ({closed})
          </button>
          {showClosed && (
            <>
              {tasks
                .filter((t) => !openTasks.includes(t))
                .map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              {notices
                .filter((n) => !openNotices.includes(n))
                .map((n) => (
                  <NoticeCard key={n.id} notice={n} />
                ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
