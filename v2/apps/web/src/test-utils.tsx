import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";

/** Render inside a real router + query client, so Links and route hooks work. */
export async function renderWithApp(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <>{ui}</> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const r = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
  return { ...r, qc, router };
}

type Handler = (url: URL, init: RequestInit) => unknown | [number, unknown];
/** Route-aware fetch stub: `{ "GET /api/clients": () => body }`; an array return sets the status. */
export function stubApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), "http://localhost");
    const method = (init.method ?? req?.method ?? "GET").toUpperCase();
    const rawBody = init.body ?? (req ? await req.clone().text() : undefined);
    const body = typeof rawBody === "string" && rawBody ? JSON.parse(rawBody) : undefined;
    calls.push({ method, path: url.pathname, body });
    const h = routes[`${method} ${url.pathname}`];
    if (!h) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    const out = h(url, init);
    const [status, json] = Array.isArray(out) ? out : [200, out];
    return Response.json(json, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
