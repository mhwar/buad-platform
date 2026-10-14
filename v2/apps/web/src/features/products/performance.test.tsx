import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { PerformancePanel } from "./PerformancePanel";
import type { Product } from "./products-api";

afterEach(() => vi.unstubAllGlobals());

const product = {
  id: "prd_1",
  slug: "patient-transport",
  name: "النقل والتسكين العلاجي",
  tagline: "",
  status: "published",
  showOnSite: true,
  version: 1,
  updatedAt: 1,
  vatRate: 15,
  readiness: [],
  pricing: { method: "margin", value: 25, lines: [], packages: [] },
  content: {
    packages: [
      { id: "full", name: "الباقة المتكاملة", audience: "", features: [], highlight: true },
    ],
  },
} as unknown as Product;

const stats = {
  totals: {
    projects: 3,
    active: 1,
    completed: 2,
    entities: 2,
    repeatEntities: 1,
    contractNet: 200000,
    gross: 230000,
    received: 115000,
    expenses: 120000,
    profit: 35000,
    realizedProfit: 30000,
    marginPct: 17.5,
    avgContract: 66666.67,
  },
  plannedMarginPct: 25,
  marginGap: -7.5,
  packages: [
    {
      packageId: "full",
      name: "الباقة المتكاملة",
      projects: 2,
      contractNet: 150000,
      profit: 30000,
      marginPct: 20,
      share: 66.67,
    },
  ],
  entities: [{ clientId: "c1", name: "جمعية جسد", projects: 2, contractNet: 150000 }],
  trend: [{ key: "2026-Q3", projects: 3, contractNet: 200000 }],
  funnel: { total: 4, new: 1, contacted: 1, quoted: 0, won: 2, lost: 0, conversionPct: 50 },
  insights: [
    { code: "margin_below_plan", gap: 7.5 },
    { code: "repeat_entities", count: 1 },
  ],
};

describe("PerformancePanel", () => {
  it("shows what the service has done: counts, entities, packages and the rule-based insights", async () => {
    stubApi({
      "GET /api/products/prd_1/stats": () => ({
        ok: true,
        product: { id: "prd_1", name: "x", slug: "x" },
        stats,
        projects: [
          {
            id: "p1",
            number: "PRJ-2026-0001",
            name: "رساء ١",
            clientId: "c1",
            clientName: "جمعية جسد",
            status: "completed",
            packageId: "full",
            packageName: "الباقة المتكاملة",
            startDate: "2026-08-01",
            hasFinance: true,
            contractNet: 100000,
            gross: 115000,
            received: 115000,
            expenses: 70000,
            profit: 30000,
          },
        ],
      }),
      "GET /api/products/unlinked-projects": () => ({ ok: true, projects: [] }),
      "GET /api/products/prd_1": () => ({ ok: true, product }),
    });
    await renderWithApp(<PerformancePanel product={product} />);
    expect(await screen.findByText("المشاريع المنفذة")).toBeInTheDocument();
    expect(screen.getByText(/الهامش الفعلي أقل من المخطط بـ 7.5 نقطة/)).toBeInTheDocument();
    expect(screen.getByText(/1 جهة كررت الخدمة/)).toBeInTheDocument();
    expect(screen.getAllByText("جمعية جسد").length).toBeGreaterThan(0);
    expect(screen.getByText("رساء ١")).toBeInTheDocument();
    expect(await screen.findByText("كل المشاريع الحالية مرتبطة بخدمة.")).toBeInTheDocument();
  });

  it("links chosen existing projects only when asked, with the chosen package", async () => {
    const calls = stubApi({
      "GET /api/products/prd_1/stats": () => ({
        ok: true,
        product: { id: "prd_1", name: "x", slug: "x" },
        stats: {
          ...stats,
          totals: { ...stats.totals, projects: 0 },
          insights: [{ code: "no_projects" }],
        },
        projects: [],
      }),
      "GET /api/products/unlinked-projects": () => ({
        ok: true,
        projects: [
          {
            id: "p9",
            number: "PRJ-9",
            name: "رساء القديم",
            clientName: "جسد",
            status: "completed",
            contractNet: 1000,
          },
        ],
      }),
      "GET /api/products/prd_1": () => ({ ok: true, product }),
      "PATCH /api/projects/p9": () => ({ ok: true }),
    });
    await renderWithApp(<PerformancePanel product={product} />);
    expect(await screen.findByText("رساء القديم")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByLabelText("اختيار رساء القديم"));
    fireEvent.change(screen.getByLabelText("باقة رساء القديم"), { target: { value: "full" } });
    fireEvent.click(screen.getByRole("button", { name: /ربط المحدد \(1\)/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        productId: "prd_1",
        packageId: "full",
      }),
    );
  });
});
