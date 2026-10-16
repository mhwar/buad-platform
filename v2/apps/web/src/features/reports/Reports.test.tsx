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
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import { ExecutionReport } from "./ExecutionReport";
import { PortfolioReport } from "./PortfolioReport";
import { ReportsPage } from "./ReportsPage";
import { REPORTS, visibleReports } from "./registry";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function open(path: string, at: string, Page: ComponentType) {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: at,
    validateSearch: (s: Record<string, unknown>) => s as Record<string, string>,
    component: Page,
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

describe("reports register", () => {
  it("has unique keys, a question each, and lists only what a role may open", () => {
    expect(new Set(REPORTS.map((r) => r.key)).size).toBe(REPORTS.length);
    for (const r of REPORTS) expect(r.question.length).toBeGreaterThan(10);
    const acc = visibleReports(meUser("finance-manager").perms).map((r) => r.key);
    expect(acc).toContain("finance-report");
    expect(acc).not.toContain("sales");
    const member = visibleReports(meUser("member").perms).map((r) => r.key);
    expect(member).toContain("portfolio");
    expect(member).not.toContain("finance-report");
  });
});

describe("reports page", () => {
  it("groups the reports by subject, carries the period into periodic ones, and keeps favourites", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("owner") }) });
    await open("/reports?preset=year&year=2026", "/reports", ReportsPage as ComponentType);
    const finance = within(await screen.findByRole("region", { name: "المالية" }));
    expect(finance.getByRole("link", { name: "التقرير المالي للجهة" })).toHaveAttribute(
      "href",
      "/finance/report?from=2026-01-01&to=2026-12-31",
    );
    const vat = screen.getByRole("link", { name: "إقرار ضريبة القيمة المضافة" });
    expect(vat.getAttribute("href")).toBe("/finance/vat/report?year=2026&q=1");
    await userEvent.click(screen.getByRole("button", { name: "إضافة محفظة المشاريع إلى المفضلة" }));
    const favs = within(screen.getByRole("region", { name: "المفضلة" }));
    expect(favs.getByRole("link", { name: "محفظة المشاريع" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("buad-report-favs") ?? "[]")).toEqual(["portfolio"]);
    await userEvent.type(screen.getByRole("searchbox"), "الضريبة");
    expect(screen.queryByRole("link", { name: "محفظة المشاريع" })).toBeNull();
  });
});

describe("portfolio report", () => {
  it("totals contracts and money in, and flags late projects", async () => {
    stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
      "GET /api/projects": () => ({
        ok: true,
        counts: {},
        items: [
          {
            id: "p1",
            number: "P1",
            name: "أ",
            status: "active",
            clientName: "ع",
            contractTotal: 10_000_000,
            received: 2_500_000,
            late: true,
            endDate: "2020-01-01",
            stagesTotal: 4,
            stagesDone: 2,
            nextDueDate: "2020-02-01",
            nextDueAmount: 100,
          },
          {
            id: "p2",
            number: "P2",
            name: "ب",
            status: "active",
            clientName: "ع",
            contractTotal: 5_000_000,
            received: 0,
            late: false,
            endDate: "",
            stagesTotal: 0,
            tasksOpen: 0,
            tasksDone: 0,
            nextDueDate: "",
          },
        ],
      }),
    });
    await open("/reports/portfolio", "/reports/portfolio", PortfolioReport);
    expect(await screen.findByText("2 مشروع · مرتبة بالأقرب انتهاءً")).toBeInTheDocument();
    expect(screen.getByText(/· 17%/)).toBeInTheDocument(); // 25,000 of 150,000 collected
    expect(screen.getByText("50%")).toBeInTheDocument(); // stages 2/4
    expect(screen.getAllByText(/متأخر/).length).toBeGreaterThan(0);
  });
});

describe("execution report", () => {
  it("shows totals and switches between people and projects", async () => {
    stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
      "GET /api/reports/execution": () => ({
        ok: true,
        period: { from: "2026-01-01", to: "2026-12-31" },
        totals: { open: 3, late: 1, done: 4, onTime: 3, minutes: 150 },
        people: [{ key: "u1", name: "نورة", open: 2, late: 1, done: 4, onTime: 3, minutes: 150 }],
        projects: [
          { key: "p1", name: "ملتقى", open: 3, late: 1, done: 4, onTime: 3, minutes: 150 },
        ],
      }),
    });
    await open(
      "/reports/execution?from=2026-01-01&to=2026-12-31",
      "/reports/execution",
      ExecutionReport,
    );
    expect(await screen.findByText("نورة")).toBeInTheDocument();
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.5 س").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: "حسب المشاريع" }));
    await waitFor(() => expect(screen.getByText("ملتقى")).toBeInTheDocument());
  });
});
