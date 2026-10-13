import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { AccountPage } from "./account";
import { api } from "./api";
import { Logo } from "./brand";
import { LoginPage } from "./login";
import { queryClient } from "./query-client";
import { meQuery, setupStatusQuery } from "./session";
import { SetupPage } from "./setup";
import { card } from "./ui";

function Shell() {
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => {
    await api.api.auth.logout.$post();
    qc.setQueryData(meQuery.queryKey, null);
    await navigate({ to: "/login" });
  };
  // Signed out: the page (login) owns the whole screen.
  if (!me.data) return <Outlet />;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/" aria-label="الرئيسية">
            <Logo className="hidden h-12 w-auto sm:block" />
            <Logo variant="icon" className="h-10 w-auto sm:hidden" />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
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
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Outlet />
      </main>
      <footer className="border-t py-4 text-center text-xs text-muted">
        بُعد التمكين · الإصدار الثاني
      </footer>
    </div>
  );
}

export function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.api.health.$get()).json(),
  });
  return (
    <section className={card}>
      <h1 className="mb-2 text-xl font-bold">الأساس جاهز</h1>
      <p className="text-muted" data-testid="status">
        {health.isPending && "جارٍ فحص الخادم…"}
        {health.isError && "الخادم غير متاح"}
        {health.data && `الخادم يعمل — الإصدار ${health.data.version}`}
      </p>
    </section>
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
  routeTree: rootRoute.addChildren([indexRoute, loginRoute, setupRoute, accountRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
