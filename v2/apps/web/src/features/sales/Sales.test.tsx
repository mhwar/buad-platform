import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { OpportunitiesPage } from "./OpportunitiesPage";
import { QuoteDialog } from "./QuoteDialog";
import { SalesDashboard } from "./SalesDashboard";

afterEach(() => vi.unstubAllGlobals());

const lead = (o: object = {}) => ({
  id: "r1",
  productId: "",
  productName: "إدارة المشاريع",
  source: "site",
  status: "quoted",
  name: "منى",
  entity: "",
  phone: "0551234567",
  email: "",
  message: "",
  answers: {},
  quote: {},
  notes: "",
  clientId: "",
  projectId: "",
  ownerId: "",
  followUpAt: "2020-01-01",
  value: 40000,
  lostReason: "",
  packageId: "",
  stageChangedAt: 0,
  updatedAt: 1,
  createdAt: Math.floor(Date.now() / 1000) - 86400,
  interest: false,
  ...o,
});
const routes = (
  role = "owner",
  requests = [
    lead(),
    lead({ id: "r2", name: "خالد", status: "negotiating", value: 100000, followUpAt: "" }),
    lead({ id: "r3", name: "سارة", status: "won", value: 9000 }),
    lead({ id: "r4", name: "ليلى", status: "lost" }),
  ],
) => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/product-requests": () => ({ ok: true, requests, counts: {} }),
  "GET /api/tasks/assignees": () => ({
    ok: true,
    users: [{ id: "u2", name: "نورة", email: "n@a.sa" }],
  }),
  "GET /api/quotes": () => ({ ok: true, quotes: [] }),
  "GET /api/quotes/vat-rate": () => ({ ok: true, rate: 15 }),
});

describe("pipeline board", () => {
  const board = () => within(screen.getByRole("list", { name: "مراحل الفرص" }));

  it("has a column per stage with its count, value and weighted value", async () => {
    stubApi(routes());
    await renderWithApp(<OpportunitiesPage />);
    await screen.findByRole("list", { name: "مراحل الفرص" });
    const col = (name: string) => within(board().getByRole("listitem", { name }));
    expect(col("عرض سعر").getByText("منى")).toBeInTheDocument();
    expect(col("عرض سعر").getAllByText(/40[,٬]?000/).length).toBeGreaterThanOrEqual(2); // the column total and the card
    expect(col("عرض سعر").getByText(/مرجّحة/)).toHaveTextContent(/16[,٬]?000/); // 40000 × 0.4
    expect(col("تفاوض").getByText("خالد")).toBeInTheDocument();
    expect(col("مكسوب").getByText("سارة")).toBeInTheDocument();
    expect(col("خاسر").getByText("ليلى")).toBeInTheDocument();
    // an empty stage folds to a slim strip
    expect(board().getByRole("listitem", { name: "جديد (فارغة)" })).toHaveTextContent("0");
  });

  it("marks a lead whose follow-up is overdue, and one nobody has touched for a week", async () => {
    stubApi(routes("owner", [lead({ updatedAt: Math.floor(Date.now() / 1000) - 9 * 86400 })]));
    await renderWithApp(<OpportunitiesPage />);
    const col = within(await screen.findByRole("listitem", { name: "عرض سعر" }));
    expect(col.getByText(/متأخرة · 1 يناير 2020/)).toBeInTheDocument();
    expect(col.getByText("راكدة")).toBeInTheDocument();
  });

  it("moves a lead by dropping it on another column", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/product-requests/r1": () => ({ ok: true }) });
    await renderWithApp(<OpportunitiesPage />);
    const target = await screen.findByRole("listitem", { name: "تفاوض" });
    const data: Record<string, string> = { "text/lead": "r1" };
    fireEvent.drop(target, { dataTransfer: { getData: (k: string) => data[k] ?? "" } });
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "negotiating" }),
    );
  });

  it("also moves it from the card's own menu (keyboard and touch)", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/product-requests/r1": () => ({ ok: true }) });
    await renderWithApp(<OpportunitiesPage />);
    const menus = await screen.findAllByRole("button", { name: /حالة منى/ });
    await userEvent.click(menus[0]!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "تفاوض" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "negotiating" }),
    );
  });

  it("a viewer sees the board without actions, and nothing can be dropped", async () => {
    const calls = stubApi({ ...routes("viewer") });
    await renderWithApp(<OpportunitiesPage />);
    const target = await screen.findByRole("listitem", { name: "تفاوض" });
    expect(screen.queryByRole("button", { name: /حالة منى/ })).toBeNull();
    fireEvent.drop(target, { dataTransfer: { getData: () => "r1" } });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("invites logging the first enquiry when there are none", async () => {
    stubApi(routes("owner", []));
    await renderWithApp(<OpportunitiesPage />);
    expect(await screen.findByText("لا فرص بعد")).toBeInTheDocument();
  });
});

describe("opportunities page", () => {
  afterEach(() => localStorage.clear());

  it("sums up the funnel on top: open, weighted, won this quarter, win rate and due follow-ups", async () => {
    stubApi(routes());
    await renderWithApp(<OpportunitiesPage />);
    const strip = within(await screen.findByRole("list", { name: "ملخص الفرص" }));
    await waitFor(() => expect(strip.getByText("مفتوحة").nextSibling).toHaveTextContent("2"));
    expect(strip.getByText("نسبة الكسب").nextSibling).toHaveTextContent("50%");
    // 40000 × 0.4 + 100000 × 0.65
    expect(strip.getByText("القيمة المرجّحة").nextSibling).toHaveTextContent(/81[,٬]?000/);
    expect(strip.getByRole("button", { name: /تحتاج متابعة اليوم/ })).toHaveTextContent("1");
  });

  it("switches to a table that links each opportunity, and remembers the choice", async () => {
    stubApi(routes());
    const { unmount } = await renderWithApp(<OpportunitiesPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /جدول/ }));
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "خالد" })).toHaveAttribute("href", "/sales/r2");
    expect(within(table).getAllByRole("row")).toHaveLength(5); // header + 4
    expect(localStorage.getItem("buad-sales-view")).toBe("table");
    unmount();
    await renderWithApp(<OpportunitiesPage />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("filters to what needs a follow-up today from the strip, and by search", async () => {
    stubApi(routes());
    await renderWithApp(<OpportunitiesPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /قائمة/ }));
    await userEvent.click(screen.getByRole("button", { name: /تحتاج متابعة اليوم/ }));
    expect(screen.getAllByRole("link", { name: "منى" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "خالد" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /تحتاج متابعة اليوم/ }));
    await userEvent.type(screen.getByRole("searchbox"), "خالد");
    expect(screen.queryByRole("link", { name: "منى" })).toBeNull();
    expect(screen.getByRole("link", { name: "خالد" })).toBeInTheDocument();
  });

  it("offers the offers list and analytics, and a new opportunity only to those who sell", async () => {
    stubApi(routes());
    const { unmount } = await renderWithApp(<OpportunitiesPage />);
    expect(await screen.findByRole("link", { name: /عروض الأسعار/ })).toHaveAttribute(
      "href",
      "/sales/quotes",
    );
    expect(screen.getByRole("link", { name: /التحليلات/ })).toHaveAttribute(
      "href",
      "/sales/analytics",
    );
    expect(await screen.findByRole("button", { name: /فرصة/ })).toBeInTheDocument();
    unmount();
    stubApi(routes("viewer"));
    await renderWithApp(<OpportunitiesPage />);
    await screen.findByRole("link", { name: /التحليلات/ });
    expect(screen.queryByRole("button", { name: /^فرصة$/ })).toBeNull();
  });
});

describe("sales dashboard", () => {
  const overview = (extra: object = {}) => ({
    ok: true,
    pipeline: {
      stages: [
        { stage: "new", count: 2, value: 10000, weighted: 1000 },
        { stage: "contacted", count: 0, value: 0, weighted: 0 },
        { stage: "quoted", count: 4, value: 80000, weighted: 32000 },
        { stage: "negotiating", count: 1, value: 40000, weighted: 26000 },
      ],
      open: { count: 7, value: 130000, weighted: 59000 },
    },
    results: { won: 3, lost: 1, winRate: 75, avgCycleDays: 21, wonThisQuarter: 90000 },
    followups: { leadsDue: 2, clientsDue: 1 },
    stale: [
      {
        id: "x",
        name: "منى",
        entity: "جمعية الأمل",
        status: "contacted",
        value: 5000,
        daysIdle: 12,
      },
    ],
    quotes: {
      sent: 5,
      accepted: 2,
      rejected: 1,
      acceptRate: 66.7,
      acceptedValue: 50000,
      avgValue: 25000,
      expiring: [
        {
          id: "q1",
          number: "QT-2026-0001",
          title: "ع",
          recipient: "خالد",
          validUntil: "2026-03-12",
          total: 11500,
        },
      ],
      waiting: [],
    },
    sources: [
      { source: "referral", total: 4, won: 2, rate: 66.7 },
      { source: "site", total: 3, won: 1, rate: 50 },
    ],
    monthlyWon: Array.from({ length: 12 }, (_, i) => ({
      month: `2025-${String(i + 1).padStart(2, "0")}`,
      value: i === 11 ? 90000 : 0,
    })),
    topClients: [{ id: "c1", name: "جمعية الأمل", value: 120000 }],
    ...extra,
  });
  const dash = (o = overview()) => ({
    "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
    "GET /api/sales/overview": () => o,
  });

  it("shows the headline numbers, the funnel, today's actions and the breakdowns", async () => {
    stubApi(dash());
    await renderWithApp(<SalesDashboard />);
    const tile = (l: string) => screen.getByText(l).parentElement as HTMLElement;
    expect(await screen.findByText("فرص مفتوحة")).toBeInTheDocument();
    expect(tile("فرص مفتوحة")).toHaveTextContent("7");
    expect(tile("القيمة المرجّحة")).toHaveTextContent(/59[,٬]?000/);
    expect(tile("المكسوب هذا الربع")).toHaveTextContent(/90[,٬]?000/);
    expect(tile("نسبة التحويل")).toHaveTextContent("75%");
    expect(tile("نسبة التحويل")).toHaveTextContent("21 يوماً للإغلاق");
    expect(
      screen.getByRole("link", { name: /متابعات حان موعدها/ }).parentElement,
    ).toHaveTextContent("3"); // 2 leads + 1 client
    expect(screen.getByText(/ينتهي/)).toBeInTheDocument();
    expect(screen.getByText("إحالة")).toBeInTheDocument(); // the source, in Arabic
    expect(screen.getByRole("img", { name: "قيمة المكسوب شهرياً" })).toBeInTheDocument();
  });

  it("says so, kindly, when there is nothing yet", async () => {
    stubApi(
      dash(
        overview({
          pipeline: { stages: [], open: { count: 0, value: 0, weighted: 0 } },
          results: { won: 0, lost: 0, winRate: null, avgCycleDays: null, wonThisQuarter: 0 },
          quotes: {
            sent: 0,
            accepted: 0,
            rejected: 0,
            acceptRate: null,
            acceptedValue: 0,
            avgValue: 0,
            expiring: [],
            waiting: [],
          },
          stale: [],
          sources: [],
          topClients: [],
          monthlyWon: Array.from({ length: 12 }, (_, i) => ({
            month: `2025-${String(i + 1).padStart(2, "0")}`,
            value: 0,
          })),
        }),
      ),
    );
    await renderWithApp(<SalesDashboard />);
    expect(await screen.findByText(/لوحتك فارغة/)).toBeInTheDocument();
    expect(screen.getByText("لا مكاسب مسجّلة في آخر 12 شهراً.")).toBeInTheDocument();
  });
});

describe("QuoteDialog", () => {
  it("previews the totals as lines change and creates the quote from a lead", async () => {
    const calls = stubApi({
      ...routes(),
      "POST /api/quotes": () => [201, { ok: true, id: "q1", number: "QT-2026-0001" }],
    });
    const onSaved = vi.fn();
    await renderWithApp(
      <QuoteDialog
        seed={{
          requestId: "r1",
          recipient: "منى",
          entity: "جمعية الأمل",
          title: "عرض سعر — إدارة المشاريع",
          value: 10000,
        }}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    const totals = await screen.findByLabelText("الإجماليات");
    expect(totals).toHaveTextContent(/11[,٬]?500/); // 10000 + 15% VAT
    await userEvent.clear(screen.getByLabelText("سعر 1"));
    await userEvent.type(screen.getByLabelText("سعر 1"), "2000");
    await userEvent.type(screen.getByLabelText("خصم (ر.س)"), "{backspace}500");
    expect(
      within(screen.getByLabelText("الإجماليات")).getByText(/الإجمالي$/).parentElement,
    ).toHaveTextContent(/1[,٬]?725/); // (2000-500)*1.15
    await userEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/quotes")).toBe(true),
    );
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      requestId: "r1",
      discount: 500,
      vatPct: 15,
      items: [{ label: "عرض سعر — إدارة المشاريع", qty: 1, unit: 2000 }],
    });
  });

  it("an accepted quote is read-only", async () => {
    stubApi(routes());
    const q = {
      id: "q1",
      number: "QT-1",
      requestId: "",
      clientId: "",
      recipient: "",
      entity: "",
      title: "ع",
      items: [{ label: "ب", qty: 1, unit: 100, total: 100 }],
      discount: 0,
      vatPct: 15,
      validUntil: "",
      expired: false,
      terms: "",
      status: "accepted" as const,
      version: 3,
      totals: { subtotal: 100, discount: 0, net: 100, vat: 15, total: 115 },
      createdAt: 1,
      productId: "",
      packageId: "",
      projectId: "",
      updatedAt: 1,
    };
    await renderWithApp(<QuoteDialog existing={q} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByText(/العرض مقبول/)).toBeInTheDocument();
    expect(screen.getByLabelText("بند 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "حفظ" })).toBeNull();
  });
});
