import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { QuoteDialog } from "./QuoteDialog";
import { PipelinePage } from "./SalesPage";

afterEach(() => vi.unstubAllGlobals());

const lead = (o: object = {}) => ({
  id: "r1",
  productId: "",
  productName: "إدارة المشاريع",
  source: "site",
  status: "quoted",
  name: "منى",
  entity: "جمعية الأمل",
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

describe("pipeline", () => {
  it("summarises open leads, the weighted forecast, conversion and due follow-ups", async () => {
    stubApi(routes());
    await renderWithApp(<PipelinePage />);
    await screen.findByText("فرص مفتوحة");
    const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    await waitFor(() => expect(stat("فرص مفتوحة")).toHaveTextContent("2"));
    // 40000 × 0.4 + 100000 × 0.65 = 81000
    expect(stat("القيمة المرجّحة")).toHaveTextContent(/81[,٬]?000/);
    expect(stat("نسبة التحويل")).toHaveTextContent("50%"); // 1 won, 1 lost
    expect(stat("متابعات حان موعدها")).toHaveTextContent("1");
  });

  it("lists a stage's leads with an overdue follow-up, and moves a lead on", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/product-requests/r1": () => ({ ok: true }) });
    await renderWithApp(<PipelinePage />);
    await userEvent.click(await screen.findByRole("tab", { name: /عُرض عليه سعر \(1\)/ }));
    expect(screen.getByText("منى")).toBeInTheDocument();
    expect(screen.getByText(/متأخرة · 2020-01-01/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("مرحلة منى"), "negotiating");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "negotiating" }),
    );
  });

  it("a viewer sees the pipeline without actions", async () => {
    stubApi(routes("viewer"));
    await renderWithApp(<PipelinePage />);
    await screen.findByText("فرص مفتوحة");
    expect(screen.queryByLabelText(/مرحلة/)).toBeNull();
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
    };
    await renderWithApp(<QuoteDialog existing={q} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByText(/العرض مقبول/)).toBeInTheDocument();
    expect(screen.getByLabelText("بند 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "حفظ" })).toBeNull();
  });
});
