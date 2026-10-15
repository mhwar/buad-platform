import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ConvertQuoteDialog } from "./ConvertQuoteDialog";
import { QuoteDialog } from "./QuoteDialog";
import { QuotesPage } from "./SalesPage";

afterEach(() => vi.unstubAllGlobals());

const NOW = Math.floor(Date.now() / 1000);
const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const quote = (o: object = {}) => ({
  id: "q1",
  number: "QT-2026-0001",
  requestId: "",
  clientId: "",
  productId: "",
  packageId: "",
  projectId: "",
  recipient: "منى",
  entity: "جمعية الأمل",
  title: "عرض خدمة",
  items: [{ label: "بند", qty: 1, unit: 1000, total: 1000 }],
  discount: 0,
  vatPct: 15,
  validUntil: "",
  expired: false,
  terms: "",
  status: "sent" as const,
  version: 1,
  updatedAt: NOW - 86400,
  totals: { subtotal: 1000, discount: 0, net: 1000, vat: 150, total: 1150 },
  createdAt: 1,
  ...o,
});
const routes = (list: object[], role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/quotes": () => ({ ok: true, quotes: list }),
  "GET /api/quotes/vat-rate": () => ({ ok: true, rate: 15 }),
  "GET /api/quotes/catalog": () => ({
    ok: true,
    items: [
      {
        productId: "p1",
        productName: "إدارة المشاريع",
        packageId: "pk1",
        packageName: "الأساسية",
        price: 8000,
      },
    ],
  }),
});

describe("QuotesPage", () => {
  const list = [
    quote({
      id: "a",
      number: "QT-1",
      status: "accepted",
      totals: { subtotal: 1000, discount: 0, net: 1000, vat: 150, total: 1150 },
    }),
    quote({
      id: "b",
      number: "QT-2",
      status: "rejected",
      totals: { subtotal: 3000, discount: 0, net: 3000, vat: 450, total: 3450 },
    }),
    quote({
      id: "c",
      number: "QT-3",
      status: "sent",
      validUntil: soon,
      totals: { subtotal: 2000, discount: 0, net: 2000, vat: 300, total: 2300 },
    }),
    quote({ id: "d", number: "QT-4", status: "sent", updatedAt: NOW - 10 * 86400 }),
    quote({ id: "e", number: "QT-5", status: "accepted", projectId: "prj1" }),
    quote({ id: "f", number: "QT-6", status: "draft" }),
  ];

  it("shows how offers are doing, and filters those ending soon or waiting for a reply", async () => {
    stubApi(routes(list));
    await renderWithApp(<QuotesPage />);
    const tile = (l: string) => screen.getByText(l).parentElement as HTMLElement;
    await screen.findByText("QT-1");
    expect(tile("أُرسلت")).toHaveTextContent("5"); // all but the draft
    expect(tile("نسبة القبول")).toHaveTextContent("66.7%"); // 2 accepted, 1 rejected
    await userEvent.click(screen.getByRole("tab", { name: /تنتهي قريباً/ }));
    expect(screen.getByText("QT-3")).toBeInTheDocument();
    expect(screen.queryByText("QT-1")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /تنتظر رداً/ }));
    expect(screen.getByText("QT-4")).toBeInTheDocument();
    expect(screen.queryByText("QT-3")).toBeNull();
  });

  it("offers to convert only an accepted quote that has no project yet, and links the project otherwise", async () => {
    stubApi(routes(list));
    await renderWithApp(<QuotesPage />);
    await screen.findByText("QT-1");
    const card = (n: string) => within(screen.getByText(n).closest("li") as HTMLElement);
    expect(card("QT-1").getByRole("button", { name: /تحويل إلى مشروع/ })).toBeInTheDocument();
    expect(card("QT-5").queryByRole("button", { name: /تحويل إلى مشروع/ })).toBeNull();
    expect(card("QT-5").getByRole("link", { name: "فتح المشروع" })).toBeInTheDocument();
    expect(card("QT-3").queryByRole("button", { name: /تحويل إلى مشروع/ })).toBeNull();
  });

  it("duplicates a quote and opens the copy", async () => {
    const calls = stubApi({
      ...routes([quote()]),
      "POST /api/quotes/q1/duplicate": () => [201, { ok: true, id: "q2", number: "QT-2" }],
    });
    await renderWithApp(<QuotesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "نسخ QT-2026-0001" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/quotes/q1/duplicate")).toBe(true),
    );
  });

  it("a reader sees the numbers but none of the tools", async () => {
    stubApi(routes(list, "viewer"));
    await renderWithApp(<QuotesPage />);
    await screen.findByText("QT-1");
    expect(screen.queryByRole("button", { name: /نسخ/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /تحويل إلى مشروع/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "عرض سعر جديد" })).toBeNull();
  });
});

describe("ConvertQuoteDialog", () => {
  it("offers the payment plans, converts with the one picked, then links the project", async () => {
    const calls = stubApi({
      "POST /api/quotes/q1/convert": () => [201, { ok: true, projectId: "prj9", instalments: 3 }],
    });
    const onDone = vi.fn();
    await renderWithApp(
      <ConvertQuoteDialog
        quote={quote({ status: "accepted" })}
        onClose={() => {}}
        onDone={onDone}
      />,
    );
    expect(screen.getByRole("radio", { name: /50% عند البدء/ })).toBeChecked(); // the usual default
    await userEvent.click(screen.getByRole("radio", { name: /40% عند البدء/ }));
    await userEvent.click(screen.getByRole("button", { name: "تحويل إلى مشروع" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        schedule: "thirds",
        projectName: "عرض خدمة",
        confirmSimilarName: false,
      }),
    );
    expect(await screen.findByText(/جدول دفعات من 3 دفعة/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "فتح المشروع" })).toHaveAttribute(
      "href",
      "/projects/prj9",
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("asks before creating a client whose name is close to an existing one", async () => {
    let n = 0;
    const calls = stubApi({
      "POST /api/quotes/q1/convert": () =>
        n++ === 0
          ? [409, { ok: false, error: "similar_name", similar: { name: "جمعية النور" } }]
          : [201, { ok: true, projectId: "p", instalments: 2 }],
    });
    await renderWithApp(
      <ConvertQuoteDialog
        quote={quote({ status: "accepted" })}
        onClose={() => {}}
        onDone={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "تحويل إلى مشروع" }));
    expect(await screen.findByText(/جمعية النور/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /نعم، أنشئ عميلاً جديداً/ }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({
        confirmSimilarName: true,
      }),
    );
  });
});

describe("the price catalogue in a quote", () => {
  it("adds a service package as a line at its price and remembers which service it priced", async () => {
    const calls = stubApi({
      ...routes([]),
      "POST /api/quotes": () => [201, { ok: true, id: "q9", number: "QT-9" }],
    });
    await renderWithApp(<QuoteDialog onClose={() => {}} onSaved={() => {}} />);
    await userEvent.selectOptions(await screen.findByLabelText("إضافة من باقة"), "p1:pk1");
    expect(screen.getByLabelText("بند 1")).toHaveValue("إدارة المشاريع — الأساسية");
    expect(screen.getByLabelText("سعر 1")).toHaveValue(8000);
    expect(screen.getByLabelText("الإجماليات")).toHaveTextContent(/9[,٬]?200/); // 8000 + 15%
    await userEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        productId: "p1",
        packageId: "pk1",
        title: "عرض سعر — إدارة المشاريع",
      }),
    );
  });
});
