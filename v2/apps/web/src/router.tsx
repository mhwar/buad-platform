import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { Briefcase, FileUp, House as Home_, Users } from "lucide-react";
import { z } from "zod";
import { AccountPage } from "./account";
import { api } from "./api";
import { Logo } from "./brand";
import { UpdateBanner, useServerVersion } from "./components/UpdateBanner";
import { ClientPage } from "./features/clients/ClientPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { ImportPage } from "./features/import/ImportPage";
import { ProjectPage } from "./features/projects/ProjectPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { Home } from "./home";
import { LoginPage } from "./login";
import { queryClient } from "./query-client";
import { meQuery, setupStatusQuery } from "./session";
import { SetupPage } from "./setup";
import { ThemeToggle } from "./theme";

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home_, exact: true },
  { to: "/clients", label: "العملاء", icon: Users, exact: false },
  { to: "/projects", label: "المشاريع", icon: Briefcase, exact: false },
] as const;

function Shell() {
  const me = useQuery(meQuery);
  const health = useServerVersion();
  // A full page load after logout: nothing of the previous user's data stays in memory,
  // and the next sign-in starts from a clean state.
  const logout = async () => {
    await api.api.auth.logout.$post().catch(() => undefined);
    window.location.assign("/login");
  };
  // Signed out: the page (login) owns the whole screen.
  if (!me.data) return <Outlet />;
  const navLink =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-brand-soft hover:text-ink";
  const navActive = "bg-brand-soft font-semibold text-brand";
  return (
    <div className="flex min-h-screen flex-col">
      <UpdateBanner />
      <header className="sticky top-0 z-20 border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="الرئيسية">
            <Logo className="hidden h-11 w-auto sm:block" />
            <Logo variant="icon" className="h-9 w-auto sm:hidden" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <Link
              to="/account"
              className="text-muted hover:text-ink"
              activeProps={{ className: "font-semibold text-ink" }}
            >
              {me.data.name || me.data.email}
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border px-3 py-1.5 text-muted transition hover:text-ink"
            >
              خروج
            </button>
          </div>
        </div>
        {/* Mobile: the sections become a scrollable strip under the header. */}
        <nav
          className="flex gap-1 overflow-x-auto border-t px-3 py-2 lg:hidden"
          aria-label="الأقسام"
        >
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className={navLink}
              activeProps={{ className: navActive }}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
          {me.data.role === "owner" && (
            <Link to="/import" className={navLink} activeProps={{ className: navActive }}>
              <FileUp className="size-4" />
              استيراد
            </Link>
          )}
        </nav>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-52 shrink-0 py-6 lg:block">
          <nav className="sticky top-24 space-y-1" aria-label="الأقسام">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className={navLink}
                activeProps={{ className: navActive }}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
            {me.data.role === "owner" && (
              <>
                <hr className="my-3" />
                <Link to="/import" className={navLink} activeProps={{ className: navActive }}>
                  <FileUp className="size-4" />
                  استيراد من المنصة الحالية
                </Link>
              </>
            )}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 py-6">
          <Outlet />
        </main>
      </div>
      <footer className="border-t py-4 text-center text-xs text-muted">
        بُعد التمكين · الإصدار الثاني ·{" "}
        <span data-testid="status">
          {health.isError
            ? "الخادم غير متاح"
            : health.data
              ? `الخادم يعمل — ${health.data.version}`
              : "…"}
        </span>
      </footer>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/login" });
  },
  component: Home,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    // Only reachable while the one-time setup is available; otherwise it does not exist.
    const needs = await queryClient.fetchQuery({ ...setupStatusQuery, staleTime: 0 });
    if (!needs) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

/** Signed-in only: every business route uses this guard. */
const authed = async () => {
  const me = await queryClient.ensureQueryData(meQuery);
  if (!me) throw redirect({ to: "/login" });
};

// List filters live in the URL, so a filtered view can be bookmarked or shared.
const listSearch = {
  q: z.string().optional(),
  sort: z.enum(["newest", "name", "value"]).optional(),
  view: z.enum(["grid", "list"]).optional(),
  archived: z.boolean().optional(),
};

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  validateSearch: z.object({ ...listSearch, type: z.string().optional() }),
  beforeLoad: authed,
  component: ClientsPage,
});
const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id",
  validateSearch: z.object({ tab: z.enum(["overview", "projects"]).optional() }),
  beforeLoad: authed,
  component: ClientPage,
});
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  validateSearch: z.object({ ...listSearch, status: z.string().optional() }),
  beforeLoad: authed,
  component: ProjectsPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id",
  // ?view= picks the section; the old ?tab= links keep working (they land on finance).
  validateSearch: z.object({
    view: z.enum(["finance", "documents", "execution"]).optional(),
    tab: z.string().optional(),
  }),
  beforeLoad: authed,
  component: ProjectPage,
});

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/login" });
    if (me.role !== "owner") throw redirect({ to: "/" });
  },
  component: ImportPage,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/login" });
  },
  component: AccountPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    setupRoute,
    accountRoute,
    clientsRoute,
    clientRoute,
    projectsRoute,
    projectRoute,
    importRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
