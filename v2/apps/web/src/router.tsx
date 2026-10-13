import { useQuery } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { api } from "./api";

function Shell() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-6 py-4 text-lg font-semibold text-brand">
        منصة بُعد — الإصدار الثاني
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
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
