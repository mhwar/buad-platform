import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import { OpportunityPage } from "./OpportunityPage";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const now = Math.floor(Date.now() / 1000);
const opp = (o: object = {}) => ({
  id: "r1",
  productId: "p1",
  productName: "إدارة المشاريع",
  packageId: "pk1",
  packageName: "الباقة الأساسية",
  source: "site",
  status: "quoted",
  name: "منى",
  entity: "جمعية الأمل",
  phone: "0551234567",
  email: "m@a.sa",
  message: "نحتاج برنامجاً تدريبياً",
  answers: { "عدد المستفيدين": "40" },
  quote: {},
  notes: "",
  clientId: "c1",
  projectId: "",
  ownerId: "u2",
  ownerName: "نورة",
  followUpAt: "2020-01-01",
  value: 40000,
  lostReason: "",
  stageChangedAt: now - 3 * 86400,
  updatedAt: now,
  createdAt: now - 10 * 86400,
  ...o,
});
const quote = (o: object = {}) => ({
  id: "q1",
  number: "QT-2026-0001",
  requestId: "r1",
  clientId: "c1",
  productId: "",
  packageId: "",
  projectId: "",
  recipient: "منى",
  entity: "جمعية الأمل",
  title: "عرض سعر — إدارة المشاريع",
  items: [{ label: "بند", qty: 1, unit: 40000, total: 40000 }],
  discount: 0,
  vatPct: 15,
  validUntil: "2099-01-01",
  expired: false,
  terms: "",
  status: "sent",
  version: 2,
  updatedAt: now,
  totals: { subtotal: 40000, discount: 0, net: 40000, vat: 6000, total: 46000 },
  createdAt: now,
  ...o,
});
const detail = (o: object = {}, quotes: object[] = [quote()]) => ({
  ok: true,
  opportunity: opp(o),
  client: { id: "c1", code: "CL-0001", name: "جمعية الأمل", phone: "", email: "", archived: false },
  quotes,
  activities: [
    {
      id: "a2",
      type: "stage",
      summary: "من «مؤهَّل» إلى «عرض سعر»",
      at: now - 3 * 86400,
      createdByName: "نورة",
      requestId: "r1",
    },
    {
      id: "a1",
      type: "call",
      summary: "اتصلت وشرحت الخدمة",
      at: now - 5 * 86400,
      createdByName: "نورة",
      requestId: "r1",
    },
  ],
});
const routes = (role = "owner", d = detail()) => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/product-requests/r1": () => d,
  "GET /api/tasks/assignees": () => ({
    ok: true,
    users: [{ id: "u2", name: "نورة", email: "n@a.sa" }],
  }),
  "GET /api/products": () => ({ ok: true, products: [] }),
  "GET /api/quotes/vat-rate": () => ({ ok: true, rate: 15 }),
  "GET /api/quotes/catalog": () => ({ ok: true, items: [] }),
});

async function open() {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: "/sales/$id",
    component: OpportunityPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/sales/r1"] }),
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

describe("opportunity page", () => {
  it("shows who, the funnel with the current stage, the numbers, and the timeline", async () => {
    stubApi(routes());
    await open();
    expect(await screen.findByRole("heading", { name: "جمعية الأمل" })).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "مراحل الفرصة" }));
    expect(steps.getByRole("button", { name: "عرض سعر" })).toHaveAttribute("aria-current", "step");
    const facts = within(screen.getByRole("list", { name: "أرقام الفرصة" }));
    expect(facts.getByText("القيمة المرجّحة").nextSibling).toHaveTextContent(/16[,٬]?000/);
    expect(facts.getByText("عمر الفرصة").nextSibling).toHaveTextContent("10 يوم");
    expect(facts.getByText("في هذه المرحلة").nextSibling).toHaveTextContent("3 يوم");
    expect(screen.getByText("اتصلت وشرحت الخدمة")).toBeInTheDocument();
    expect(screen.getByText("من «مؤهَّل» إلى «عرض سعر»")).toBeInTheDocument();
    // a stage move is written by the platform and cannot be deleted; a contact can
    expect(screen.getAllByRole("button", { name: "حذف التواصل" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /واتساب/ })).toHaveAttribute(
      "href",
      "https://wa.me/966551234567",
    );
  });

  it("moves along the funnel by clicking a stage", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/product-requests/r1": () => ({ ok: true }) });
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "تفاوض" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "negotiating" }),
    );
  });

  it("losing asks why, and saves the reason with the stage", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/product-requests/r1": () => ({ ok: true }) });
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "خاسر" }));
    const dlg = within(await screen.findByRole("dialog"));
    await userEvent.click(dlg.getByRole("button", { name: "السعر" }));
    await userEvent.click(dlg.getByRole("button", { name: "إغلاق كخاسرة" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        status: "lost",
        lostReason: "السعر",
      }),
    );
  });

  it("winning offers to turn the accepted offer into a project", async () => {
    stubApi(routes("owner", detail({ status: "negotiating" }, [quote({ status: "accepted" })])));
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "مكسوب" }));
    const dlg = within(await screen.findByRole("dialog"));
    expect(
      dlg.getByRole("button", { name: /تحويل العرض المقبول QT-2026-0001 إلى مشروع/ }),
    ).toBeInTheDocument();
    expect(dlg.getByRole("button", { name: /تعليمها كمكسوبة فقط/ })).toBeInTheDocument();
  });

  it("logs a contact with the next follow-up in one go", async () => {
    const calls = stubApi({
      ...routes(),
      "POST /api/product-requests/r1/activities": () => ({ ok: true, id: "a3", clientId: "c1" }),
    });
    await open();
    await screen.findByRole("heading", { name: "جمعية الأمل" });
    await userEvent.click(screen.getByRole("radio", { name: "واتساب" }));
    await userEvent.type(screen.getByLabelText("ملخص التواصل"), "أرسلت العرض");
    const week = screen
      .getAllByRole("button", { name: "بعد أسبوع" })
      .find((b) => b.hasAttribute("aria-pressed"));
    await userEvent.click(week as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "حفظ التواصل" }));
    await waitFor(() => {
      const body = calls.find((c) => c.method === "POST")?.body as Record<string, string>;
      expect(body.type).toBe("whatsapp");
      expect(body.summary).toBe("أرسلت العرض");
      expect(body.followUpAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("lists its offers, and shows what was asked in the details", async () => {
    stubApi(routes());
    await open();
    await userEvent.click(await screen.findByRole("tab", { name: /عروض الأسعار \(1\)/ }));
    expect(screen.getByText("QT-2026-0001")).toBeInTheDocument();
    expect(screen.getByText(/46[,٬]?000/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "التفاصيل" }));
    expect(screen.getByText("نحتاج برنامجاً تدريبياً")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("a viewer reads it without the actions", async () => {
    stubApi(routes("viewer"));
    await open();
    await screen.findByRole("heading", { name: "جمعية الأمل" });
    expect(screen.queryByRole("button", { name: "سجّل تواصلاً" })).toBeNull();
    expect(screen.getByRole("button", { name: "تفاوض" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "حفظ التواصل" })).toBeNull();
  });
});

describe("new opportunity", () => {
  const base = {
    "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
    "GET /api/clients": () => ({
      ok: true,
      items: [{ id: "c1", name: "جمعية الأمل" }],
      counts: {},
    }),
    "GET /api/products": () => ({ ok: true, products: [] }),
    "GET /api/tasks/assignees": () => ({ ok: true, users: [] }),
  };
  async function show() {
    const root = createRootRoute({
      component: () => (
        <>
          <NewOpportunityDialog open onClose={() => {}} />
          <Outlet />
        </>
      ),
    });
    const page = createRoute({
      getParentRoute: () => root,
      path: "/sales/$id",
      component: () => <p>فُتحت</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    );
  }

  it("is for an existing client by default, and opens its page once made", async () => {
    const calls = stubApi({
      ...base,
      "POST /api/product-requests": () => ({ ok: true, id: "r9", clientId: "c1" }),
    });
    await show();
    const dlg = within(await screen.findByRole("dialog"));
    await userEvent.selectOptions(await dlg.findByLabelText("العميل"), "c1");
    await userEvent.type(dlg.getByLabelText("القيمة المتوقعة (ر.س)"), "25000");
    await userEvent.click(dlg.getByRole("button", { name: "إنشاء الفرصة" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        clientId: "c1",
        value: 25000,
      }),
    );
    expect(await screen.findByText("فُتحت")).toBeInTheDocument();
  });

  it("makes a new client in the same step, and offers the similar one it finds", async () => {
    let n = 0;
    const calls = stubApi({
      ...base,
      "POST /api/product-requests": () =>
        ++n === 1
          ? [
              409,
              {
                ok: false,
                error: "similar_name",
                similar: { id: "c1", name: "جمعية الأمل", code: "CL-0001" },
              },
            ]
          : { ok: true, id: "r9", clientId: "c1" },
    });
    await show();
    const dlg = within(await screen.findByRole("dialog"));
    await userEvent.click(dlg.getByRole("tab", { name: "عميل جديد" }));
    await userEvent.type(dlg.getByLabelText("اسم الجهة أو العميل"), "جمعيه الامل");
    await userEvent.click(dlg.getByRole("button", { name: "إنشاء الفرصة" }));
    expect(await dlg.findByText(/يوجد عميل باسم مشابه/)).toBeInTheDocument();
    expect(calls[calls.length - 1]?.body).toMatchObject({ newClient: true, entity: "جمعيه الامل" });
    await userEvent.click(dlg.getByRole("button", { name: "استخدم هذا العميل" }));
    expect(dlg.getByLabelText("العميل")).toHaveValue("c1");
  });
});
