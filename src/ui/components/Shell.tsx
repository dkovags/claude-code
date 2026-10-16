import {
  Activity, ChevronLeft, CircleUser, CloudCheck, CloudOff, CloudUpload, Flag, LayoutDashboard, List, Plus, Receipt, Search,
  Tag, User, Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { friendsOf, isValidEmail, findPersonByEmail } from "../../domain/people";
import * as A from "../../store/actions";
import { APP_NAME } from "../../config";
import { useData, useIsMobile, useRun, useStatus, useStore, useUI } from "../context";
import { href, navigate, useRoute, type Route } from "../router";
import { Avatar } from "./basics";
import { Logo } from "./Logo";

export function inviteLink(email: string, inviterName: string) {
  const url = window.location.href.split("#")[0];
  const subject = `${inviterName} convidou você para o ${APP_NAME}`;
  const body = `Olá! Estou usando o ${APP_NAME} para dividir nossas despesas. Acesse: ${url}`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function NavLink({ to, active, icon, children }: { to: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <a href={href(to)} className={`nav-link ${active ? "active" : ""}`}>
      {icon}
      <span className="nav-text">{children}</span>
    </a>
  );
}

function LeftNav({ route }: { route: Route }) {
  const { ds, me, ledger } = useData();
  const ui = useUI();
  const runAction = useRun();
  const [invite, setInvite] = useState("");
  const groups = Object.values(ds.groups)
    .filter((g) => !g.deletedAt && g.memberIds.includes(me))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const friends = friendsOf(ds);
  const hasNonGroup = ledger.active.some((e) => !e.groupId);

  const sendInvite = () => {
    const email = invite.trim();
    if (!isValidEmail(email)) return ui.toast("Digite um e-mail válido.", { kind: "error" });
    if (!findPersonByEmail(ds, email) && !runAction(A.addPerson, { name: email.split("@")[0], email })) return;
    window.location.href = inviteLink(email, ds.people[me]?.name || "");
    setInvite("");
    ui.toast("Convite preparado no seu e-mail.");
  };

  return (
    <nav className="left-nav" aria-label="Navegação">
      <NavLink to="/" active={route.name === "dashboard"} icon={<LayoutDashboard size={17} />}>
        Painel
      </NavLink>
      <NavLink to="/activity" active={route.name === "activity"} icon={<Flag size={17} />}>
        Atividade recente
      </NavLink>
      <NavLink to="/all" active={route.name === "all"} icon={<List size={17} />}>
        Todas as despesas
      </NavLink>

      <div className="nav-section">
        <span>Grupos</span>
        <button className="nav-add" onClick={() => ui.open({ type: "group" })}>
          <Plus size={13} /> adicionar
        </button>
      </div>
      {groups.length === 0 && <div className="nav-empty">Você ainda não tem grupos.</div>}
      {groups.map((g) => (
        <NavLink key={g.id} to={`/groups/${g.id}`} active={route.name === "group" && route.id === g.id} icon={<Tag size={15} />}>
          {g.name}
        </NavLink>
      ))}
      {hasNonGroup && (
        <NavLink to="/nongroup" active={route.name === "nongroup"} icon={<Tag size={15} />}>
          <i>Despesas sem grupo</i>
        </NavLink>
      )}

      <div className="nav-section">
        <span>Amigos</span>
        <button className="nav-add" onClick={() => ui.open({ type: "friend" })}>
          <Plus size={13} /> adicionar
        </button>
      </div>
      {friends.length === 0 && <div className="nav-empty">Adicione amigos para dividir despesas.</div>}
      {friends.map((p) => (
        <NavLink key={p.id} to={`/friends/${encodeURIComponent(p.id)}`} active={route.name === "friend" && route.id === p.id} icon={<User size={15} />}>
          {p.name}
        </NavLink>
      ))}

      <div className="invite-box">
        <div className="invite-title">Convidar amigos</div>
        <div className="invite-body">
          <input
            type="email"
            placeholder="email@exemplo.com"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendInvite()}
            aria-label="E-mail para convite"
          />
          <button className="btn btn-gray btn-sm" onClick={sendInvite}>
            Enviar convite
          </button>
        </div>
      </div>
    </nav>
  );
}

function TopBar({ route }: { route: Route }) {
  const { ds, me } = useData();
  const mobile = useIsMobile();
  const isRoot = ["dashboard", "groups", "friends", "activity", "account"].includes(route.name);
  let title = "";
  if (route.name === "group") title = ds.groups[route.id]?.name || "Grupo";
  else if (route.name === "friend") title = ds.people[route.id]?.name || "Amigo";
  else if (route.name === "all") title = "Todas as despesas";
  else if (route.name === "nongroup") title = "Despesas sem grupo";
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {mobile && !isRoot ? (
          <button className="icon-btn light back-btn" onClick={() => (history.length > 1 ? history.back() : navigate("/"))} aria-label="Voltar">
            <ChevronLeft size={24} />
            <span className="topbar-title">{title}</span>
          </button>
        ) : (
          <a className="brand" href={href("/")}>
            <Logo size={28} />
            <span>{APP_NAME}</span>
          </a>
        )}
        <div className="topbar-right">
          <SyncIndicator />
          <a className="icon-btn light" href={href("/all")} aria-label="Buscar" title="Buscar despesas">
            <Search size={20} />
          </a>
          {!mobile && (
            <a className="user-chip" href={href("/account")} title="Sua conta">
              <Avatar person={ds.people[me]} size={26} />
              <span>{ds.people[me]?.name}</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Ícone de sincronização (só no modo nuvem). */
function SyncIndicator() {
  const store = useStore();
  const status = useStatus();
  const online = useOnline();
  if (store.mode !== "cloud") return null;
  const [Icon, title] = !online
    ? [CloudOff, "Sem internet: as alterações serão enviadas quando a conexão voltar"]
    : status.pending
      ? [CloudUpload, "Enviando alterações…"]
      : [CloudCheck, "Tudo sincronizado"];
  return (
    <a className={`icon-btn light sync ${!online ? "offline" : status.pending ? "busy" : ""}`} href={href("/account")} title={title} aria-label={title}>
      <Icon size={20} />
    </a>
  );
}

function TabBar({ route }: { route: Route }) {
  const tabs: { to: string; label: string; icon: ReactNode; active: boolean }[] = [
    { to: "/groups", label: "Grupos", icon: <Users size={22} />, active: ["dashboard", "groups", "group", "nongroup"].includes(route.name) },
    { to: "/friends", label: "Amigos", icon: <User size={22} />, active: ["friends", "friend"].includes(route.name) },
    { to: "/activity", label: "Atividade", icon: <Activity size={22} />, active: route.name === "activity" },
    { to: "/account", label: "Conta", icon: <CircleUser size={22} />, active: route.name === "account" },
  ];
  return (
    <nav className="tabbar" aria-label="Abas">
      {tabs.map((t) => (
        <a key={t.to} href={href(t.to)} className={`tab ${t.active ? "active" : ""}`}>
          {t.icon}
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const ui = useUI();
  const mobile = useIsMobile();
  const fabContext =
    route.name === "group" ? { groupId: route.id } : route.name === "friend" ? { friendId: route.id } : {};
  return (
    <div className="app">
      <TopBar route={route} />
      <div className="layout">
        <aside className="left-col">
          <LeftNav route={route} />
        </aside>
        {children}
      </div>
      {mobile && route.name !== "account" && (
        <button className="fab" onClick={() => ui.open({ type: "expense", ...fabContext })}>
          <Receipt size={20} />
          Adicionar despesa
        </button>
      )}
      {mobile && <TabBar route={route} />}
    </div>
  );
}

/** Coluna central (com cabeçalho cinza e botões) e coluna da direita de uma página. */
export function Page({
  title,
  icon,
  actions,
  right,
  children,
  hideHeaderOnMobile,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  hideHeaderOnMobile?: boolean;
}) {
  return (
    <>
      <main className="main-col">
        <div className={`main-header ${hideHeaderOnMobile ? "hide-mobile" : ""}`}>
          <h1>
            {icon}
            <span>{title}</span>
          </h1>
          {actions && <div className="header-actions">{actions}</div>}
        </div>
        {children}
      </main>
      <aside className="right-col">{right}</aside>
    </>
  );
}

/** Botões padrão "Adicionar uma despesa" e "Acertar contas". */
export function MainActions({ groupId, friendId }: { groupId?: string | null; friendId?: string }) {
  const ui = useUI();
  return (
    <>
      <button className="btn btn-orange" onClick={() => ui.open({ type: "expense", groupId, friendId })}>
        Adicionar uma despesa
      </button>
      <button className="btn btn-mint" onClick={() => ui.open({ type: "settle", groupId, friendId })}>
        Acertar contas
      </button>
    </>
  );
}

