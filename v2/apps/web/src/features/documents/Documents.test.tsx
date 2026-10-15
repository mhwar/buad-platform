import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import { DocumentsPage } from "./DocumentsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const now = Math.floor(Date.now() / 1000);
const doc = (o: object = {}) => ({
  id: "d1",
  kind: "contract",
  number: "CT-2026-0001",
  title: "عقد تنفيذ ملتقى",
  status: "approved",
  outgoingNo: "ص/12",
  outgoingAt: now - 86400,
  updatedAt: now - 86400,
  projectId: "p1",
  projectNumber: "PR-1",
  projectName: "ملتقى الشباب",
  clientId: "c1",
  clientName: "جمعية الأمل",
  clientLogo: "",
  ...o,
});
const quote = (o: object = {}) => ({
  id: "q1",
  number: "QT-2026-0001",
  requestId: "r1",
  clientId: "",
  productId: "",
  packageId: "",
  projectId: "",
  recipient: "منى",
  entity: "جمعية البر",
  title: "عرض برنامج تدريبي",
  items: [],
  discount: 0,
  vatPct: 15,
  validUntil: "",
  expired: false,
  terms: "",
  status: "sent",
  version: 1,
  updatedAt: now,
  totals: { subtotal: 10000, discount: 0, net: 10000, vat: 1500, total: 11500 },
  createdAt: now,
  ...o,
});
const routes = (role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/documents": () => ({
    ok: true,
    items: [
      doc(),
      doc({
        id: "d2",
        kind: "letter",
        title: "خطاب شكر",
        status: "draft",
        outgoingNo: "",
        outgoingAt: null,
        number: "LT-2026-0001",
        updatedAt: now - 400 * 86400,
      }),
    ],
    counts: [],
    outgoingCount: 1,
  }),
  "GET /api/quotes": () => ({ ok: true, quotes: [quote()] }),
  "GET /api/projects": () => ({
    ok: true,
    items: [{ id: "p1", name: "ملتقى الشباب" }],
    counts: {},
  }),
  "GET /api/documents/templates": () => ({
    ok: true,
    contracts: [{ key: "standard", title: "عقد قياسي", clauses: 12 }],
    letters: [{ key: "custom", title: "خطاب مخصص" }],
  }),
});

async function open(path = "/documents") {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: "/documents",
    validateSearch: (s: Record<string, unknown>) => s as Record<string, string>,
    component: DocumentsPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe("documents hub", () => {
  it("lists contracts, letters and quotes together, newest first, with counts per kind", async () => {
    stubApi(routes());
    await open();
    expect(await screen.findByText("عرض برنامج تدريبي")).toBeInTheDocument();
    const kinds = within(screen.getAllByRole("tablist").at(-1) as HTMLElement);
    expect(kinds.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "الكل3",
      "العقود1",
      "الخطابات1",
      "عروض الأسعار1",
    ]);
    const titles = screen
      .getAllByRole("button", { name: /عقد تنفيذ|خطاب شكر|عرض برنامج/ })
      .map((b) => b.textContent)
      .filter(Boolean); // the «إجراءات …» menus carry only an aria-label
    expect(titles).toEqual(["عرض برنامج تدريبي", "عقد تنفيذ ملتقى", "خطاب شكر"]);
    expect(screen.getByText(/3 مستند · 1 مسودة · 1 في سجل الصادر/)).toBeInTheDocument();
  });

  it("filters by kind, status and period, and switches to a table it remembers", async () => {
    stubApi(routes());
    await open("/documents?status=draft");
    await screen.findByText("خطاب شكر");
    expect(screen.queryByText("عقد تنفيذ ملتقى")).toBeNull();
    expect(screen.queryByText("عرض برنامج تدريبي")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "جدول" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(localStorage.getItem("buad-documents-layout")).toBe("table");
  });

  it("the period filter drops what is older", async () => {
    stubApi(routes());
    await open("/documents?period=year");
    await screen.findByText("عقد تنفيذ ملتقى");
    expect(screen.queryByText("خطاب شكر")).toBeNull();
  });

  it("someone who does not sell sees no quotes", async () => {
    const calls = stubApi(routes("member"));
    await open();
    await screen.findByText("عقد تنفيذ ملتقى");
    expect(screen.queryByText("عرض برنامج تدريبي")).toBeNull();
    expect(calls.some((c) => c.path === "/api/quotes")).toBe(false);
  });

  it("«+ مستند» offers a contract/letter or a quote; a document asks for its project first", async () => {
    const calls = stubApi({
      ...routes(),
      "POST /api/projects/p1/documents": () => ({ ok: true, id: "d9" }),
    });
    await open();
    await userEvent.click(await screen.findByRole("button", { name: /مستند/ }));
    await userEvent.click(await screen.findByRole("button", { name: /عقد أو خطاب/ }));
    const dlg = within(await screen.findByRole("dialog"));
    const option = await dlg.findByRole("button", { name: /عقد قياسي/ });
    expect(option).toBeDisabled();
    await userEvent.selectOptions(dlg.getByLabelText("المشروع"), "p1");
    const ready = dlg.getByRole("button", { name: /عقد قياسي/ });
    expect(ready).toBeEnabled();
    await userEvent.click(ready);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.includes("/documents"))).toBe(true),
    );
  });
});
