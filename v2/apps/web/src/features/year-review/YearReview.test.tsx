import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { YearReview } from "./YearReview";

afterEach(() => vi.unstubAllGlobals());

const item = (o: object) => ({
  id: "p1",
  number: "PRJ-1",
  name: "ملتقى الشباب",
  status: "completed",
  clientId: "c1",
  clientName: "جمعية الأمل",
  contractDate: "2026-02-01",
  startDate: "2026-02-01",
  estimated: false,
  gross: 115000,
  received: 50000,
  receivedYear: 50000,
  remaining: 65000,
  lastReceipt: "2026-03-10",
  overdueLines: 0,
  pendingLines: 0,
  flags: ["closed_not_paid"],
  ...o,
});
const review = {
  ok: true,
  year: 2026,
  totals: {
    revenue: 1200000,
    target: 2000000,
    projectReceipts: 1150000,
    receiptsVat: 150000,
    companyIncome: 50000,
    unrecorded: 65000,
    collecting: 0,
  },
  counts: { closed_not_paid: 1, paid_not_closed: 1, overdue: 0, no_receipts: 0, no_contract: 0 },
  items: [
    item({}),
    item({
      id: "p2",
      name: "برنامج التطوع",
      status: "active",
      received: 23000,
      gross: 23000,
      remaining: 0,
      flags: ["paid_not_closed"],
    }),
    item({
      id: "p3",
      name: "مشروع مرتّب",
      status: "completed",
      received: 1000,
      gross: 1000,
      remaining: 0,
      flags: [],
    }),
  ],
};
const routes = (role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/finance/year-review": () => review,
  "PATCH /api/projects/p2": () => ({ ok: true }),
});

describe("YearReview", () => {
  it("shows the year against its target and lists what needs a look", async () => {
    stubApi(routes());
    await renderWithApp(<YearReview year={2026} onYear={() => {}} />);
    expect(await screen.findByText(/1,200,000/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "نسبة تحقيق المستهدف" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
    expect(screen.getByText(/منها ضريبة/)).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "المشاريع للمراجعة" });
    expect(within(list).getByText("ملتقى الشباب")).toBeInTheDocument();
    expect(within(list).queryByText("مشروع مرتّب")).toBeNull(); // nothing to check there
    await userEvent.click(screen.getByRole("tab", { name: /الكل \(3\)/ }));
    expect(within(list).getByText("مشروع مرتّب")).toBeInTheDocument();
  });

  it("closes a fully paid project from the list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const calls = stubApi(routes());
    await renderWithApp(<YearReview year={2026} onYear={() => {}} />);
    await userEvent.click(await screen.findByRole("tab", { name: /محصَّل بالكامل/ }));
    await userEvent.click(screen.getByRole("button", { name: /إغلاق كمكتمل/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "completed" }),
    );
  });

  it("lets people without finance edit only read", async () => {
    stubApi(routes("accountant"));
    await renderWithApp(<YearReview year={2026} onYear={() => {}} />);
    await screen.findByText("ملتقى الشباب");
    expect(screen.queryByRole("button", { name: /تسجيل مقبوض|إغلاق/ })).toBeNull();
  });
});
