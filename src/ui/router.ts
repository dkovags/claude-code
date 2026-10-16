import { useSyncExternalStore } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "activity" }
  | { name: "all"; q?: string }
  | { name: "groups" }
  | { name: "friends" }
  | { name: "group"; id: string }
  | { name: "friend"; id: string }
  | { name: "nongroup" }
  | { name: "account" };

export function parseRoute(hash: string): Route {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query || "");
  switch (parts[0]) {
    case "activity":
      return { name: "activity" };
    case "all":
      return { name: "all", q: params.get("q") || undefined };
    case "groups":
      return parts[1] ? { name: "group", id: parts[1] } : { name: "groups" };
    case "friends":
      return parts[1] ? { name: "friend", id: parts[1] } : { name: "friends" };
    case "nongroup":
      return { name: "nongroup" };
    case "account":
      return { name: "account" };
    default:
      return { name: "dashboard" };
  }
}

export function routePath(r: Route): string {
  switch (r.name) {
    case "group":
      return `/groups/${encodeURIComponent(r.id)}`;
    case "friend":
      return `/friends/${encodeURIComponent(r.id)}`;
    case "all":
      return r.q ? `/all?q=${encodeURIComponent(r.q)}` : "/all";
    case "dashboard":
      return "/";
    default:
      return `/${r.name}`;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = "#" + path;
  if (window.location.hash === target) return;
  if (opts.replace) window.location.replace(target);
  else {
    window.location.hash = path;
    window.scrollTo(0, 0);
  }
}

export const href = (path: string) => "#" + path;
