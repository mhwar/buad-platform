import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { api } from "./api";
import { LoginPage } from "./login";
import { queryClient } from "./query-client";
import { meQuery } from "./session";

function Shell() {
  const me = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => {
    await api.api.auth.logout.$post();
    qc.setQueryData(meQuery.queryKey, null);
    await navigate({ to: "/login" });
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <span className="text-lg font-semibold text-brand">منصة بُعد — الإصدار الثاني</span>
        {me.data && (
          <span className="flex items-center gap-3 text-sm">
            {me.data.name || me.data.email}
            <button type="button" onClick={logout} className="rounded border px-2 py-1">
              خروج
            </button>
          </span>
        )}
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <Outlet />
      </main>
    </div>
  );
}

export function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.api.health.$get()).json(),
  });
  return (
    <section className="rounded-lg border bg-white p-6">
      <h1 className="mb-2 text-xl font-bold">الأساس جاهز</h1>
      <p className="text-slate-600" data-testid="status">
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

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, loginRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
