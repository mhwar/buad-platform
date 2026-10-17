import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ForecastChart } from "./ForecastChart";
import { ReceivablesPage } from "./ReceivablesPage";
import { ScheduleCard } from "./ScheduleCard";

afterEach(() => vi.unstubAllGlobals());

const week = (i: number, balance: number) => ({
  start: `2026-03-${String(1 + i * 7).padStart(2, "0")}`,
  end: "",
  inflow: 0,
  outflow: 0,
  net: 0,
  balance,
});
const data = (extra: object = {}) => ({
  ok: true,
  today: "2026-03-01",
  aging: {
    total: 40250,
    overdue: 17250,
    buckets: {
      current: { amount: 23000, count: 1 },
      d1_30: { amount: 5750, count: 1 },
      d31_60: { amount: 11500, count: 1 },
      d61_90: { amount: 0, count: 0 },
      d90: { amount: 0, count: 0 },
    },
  },
  items: [
    {
      id: "s1",
      projectId: "p1",
      label: "الدفعة الأولى",
      dueDate: "2026-01-15",
      amount: 11500,
      status: "pending",
      receivedAt: "",
      project: "ملتقى الشباب",
      client: "جمعية الأمل",
      phone: "0551234567",
    },
  ],
  weeks: [week(0, 1000), week(1, -500)],
  shortfallWeek: "2026-03-08",
  pendingExpenses: 3000,
  ...extra,
});

describe("ReceivablesPage", () => {
  const base = (role = "owner") => ({
    "GET /api/me": () => ({ ok: true, user: meUser(role) }),
    "GET /api/receivables": () => data(),
  });

  it("shows ageing buckets, the overdue total, a shortfall warning and the owed instalments", async () => {
    stubApi(base());
    await renderWithApp(<ReceivablesPage />);
    expect(await screen.findByText("أعمار الديون")).toBeInTheDocument();
    expect(screen.getByText("أكثر من 90 يوماً")).toBeInTheDocument();
    expect(screen.getByText(/المتأخر:/)).toHaveTextContent(/17[,٬]?250/);
    expect(screen.getByText(/يتوقع أن ينخفض الرصيد عن الصفر/)).toBeInTheDocument();
    expect(screen.getByText(/متأخرة · /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /تذكير واتساب/ })).toHaveAttribute(
      "href",
      expect.stringContaining("wa.me/966551234567"),
    );
  });

  it("marks an instalment received", async () => {
    const calls = stubApi({
      ...base(),
      "POST /api/receivables/s1/receive": () => ({ ok: true, receiptId: "r" }),
    });
    await renderWithApp(<ReceivablesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /تسجيل مقبوض/ }));
    // The day it reached the bank and how much: part of it keeps the rest as a new instalment.
    const amount = await screen.findByLabelText(/المبلغ المستلم/);
    await userEvent.clear(amount);
    await userEvent.type(amount, "1000");
    expect(screen.getByText(/استلام جزئي/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تسجيل المقبوض" }));
    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.path.endsWith("/receive"));
      expect(post?.body).toMatchObject({ amount: 1000 });
    });
  });

  it("people who cannot edit finance only read", async () => {
    stubApi(base("accountant"));
    await renderWithApp(<ReceivablesPage />);
    await screen.findByText("أعمار الديون");
    expect(screen.queryByRole("button", { name: /تسجيل مقبوض/ })).toBeNull();
  });
});

describe("ForecastChart", () => {
  it("draws a bar per week, red below zero, with the table available", () => {
    const { container } = render(<ForecastChart weeks={[week(0, 1000), week(1, -500)]} />);
    const bars = container.querySelectorAll("rect");
    expect(bars).toHaveLength(2);
    expect(bars[1]?.getAttribute("fill")).toBe("#dc2626");
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
  });
});

describe("ScheduleCard", () => {
  it("lists a project's instalments, adds one and hides itself when empty for readers", async () => {
    const calls = stubApi({
      "GET /api/receivables/projects/p1": () => ({
        ok: true,
        items: [
          {
            id: "s1",
            projectId: "p1",
            label: "الأولى",
            dueDate: "2999-01-01",
            amount: 5000,
            status: "pending",
            receivedAt: "",
          },
        ],
      }),
      "POST /api/receivables/projects/p1": () => [201, { ok: true, id: "s2" }],
    });
    await renderWithApp(<ScheduleCard projectId="p1" canEdit />);
    expect(await screen.findByText("الأولى")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^دفعة$/ }));
    await userEvent.type(screen.getByLabelText("الوصف"), "الثانية");
    await userEvent.type(screen.getByLabelText("تاريخ الاستحقاق"), "2026-05-01");
    await userEvent.type(screen.getByLabelText(/المبلغ شامل/), "2300");
    await userEvent.click(screen.getByRole("button", { name: "إضافة" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        label: "الثانية",
        dueDate: "2026-05-01",
        amount: 2300,
      }),
    );
  });
  it("renders nothing for a reader when there are no instalments", async () => {
    stubApi({ "GET /api/receivables/projects/p1": () => ({ ok: true, items: [] }) });
    const { container } = await renderWithApp(<ScheduleCard projectId="p1" canEdit={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("h2")).toBeNull();
  });
});
