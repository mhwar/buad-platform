import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import type { ClientListItem, Statement } from "./api";
import { ClientsPage } from "./ClientsPage";
import { statementCsv } from "./StatementPage";

afterEach(() => vi.unstubAllGlobals());

const item: ClientListItem = {
  id: "c1",
  code: "CL-0001",
  name: "جمعية أجيالنا",
  type: "association",
  city: "أبها",
  email: "a@b.sa",
  phone: "0551234567",
  logoUrl: "",
  createdAt: 1,
  archivedAt: null,
  projectCount: 4,
  projectValue: 11500000,
  recentProjects: [
    { id: "p1", name: "أكاديمية ق" },
    { id: "p2", name: "ملتقى" },
  ],
  documentsCount: 3,
  lastActivity: Math.floor(Date.now() / 1000) - 86400 * 2,
  ownerId: "",
  ownerName: "",
  source: "",
  tags: [],
  nextFollowUpAt: "",
  lastContactAt: 0,
  activeProjects: 1,
  completedProjects: 0,
  openRequests: 0,
  openQuotes: 0,
  relationship: "active" as const,
};
const me = (role: string) => () => ({ user: meUser(role) });

async function render(role: string, c: ClientListItem = item) {
  stubApi({
    "GET /api/me": me(role),
    "GET /api/clients": () => ({ items: [c], counts: { association: 1 } }),
  });
  // ClientsPage reads its search params from the /clients route.
  const { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider } =
    await import("@tanstack/react-router");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { render: r } = await import("@testing-library/react");
  const root = createRootRoute();
  const clients = createRoute({
    getParentRoute: () => root,
    path: "/clients",
    component: ClientsPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([clients]),
    history: createMemoryHistory({ initialEntries: ["/clients"] }),
  });
  await router.load();
  r(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe("client card", () => {
  it("shows contacts, recent projects, stats and the full action menu for managers", async () => {
    await render("admin");
    expect(await screen.findByText("جمعية أجيالنا")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "واتساب" })).toHaveAttribute(
      "href",
      "https://wa.me/966551234567",
    );
    expect(screen.getByRole("link", { name: "أكاديمية ق" })).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/آخر نشاط/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إجراءات جمعية أجيالنا" }));
    const menu = await screen.findByRole("menu");
    for (const name of [/مشروع جديد/, /إضافة قيد مالي/, /كشف حساب/, /تعديل/, /أرشفة/])
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
  });

  it("members only get the statement", async () => {
    await render("member");
    await screen.findByText("جمعية أجيالنا");
    await userEvent.click(screen.getByRole("button", { name: "إجراءات جمعية أجيالنا" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).getByRole("menuitem", { name: /كشف حساب/ })).toBeInTheDocument();
  });

  it("shows what the client owes, its late instalments and open opportunities", async () => {
    await render("admin", { ...item, owed: 500000, lateInstalments: 2, openRequests: 1 });
    await screen.findByText("جمعية أجيالنا");
    expect(screen.getAllByText("المستحق عليه").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 دفعات متأخرة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 فرصة مفتوحة").length).toBeGreaterThan(0);
    expect(screen.queryByText("المستندات")).not.toBeInTheDocument();
  });

  it("without finance it keeps the documents count instead of the money owed", async () => {
    await render("member", { ...item, owed: null });
    await screen.findByText("جمعية أجيالنا");
    expect(screen.getByText("المستندات")).toBeInTheDocument();
    expect(screen.queryByText("المستحق عليه")).not.toBeInTheDocument();
  });
});

describe("statement CSV", () => {
  it("starts with a BOM, quotes cells and ends with the totals", () => {
    const st = {
      client: { name: 'جمعية "خبرة"' },
      items: [
        {
          number: "PRJ-2026-0001",
          name: "برنامج، تدريبي",
          status: "active",
          contractNo: "",
          contractNet: 100000,
          vat: 15000,
          gross: 115000,
          spent: 10000,
          remaining: 105000,
          received: 50000,
          owed: 65000,
        },
      ],
      totals: {
        contractNet: 100000,
        vat: 15000,
        gross: 115000,
        spent: 10000,
        remaining: 105000,
        received: 50000,
        owed: 65000,
      },
    } as unknown as Statement;
    const csv = statementCsv(st);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"برنامج، تدريبي"');
    expect(lines[2]).toBe(
      '"","الإجمالي","","","100000","15000","115000","10000","105000","50000","65000"',
    );
  });
});
