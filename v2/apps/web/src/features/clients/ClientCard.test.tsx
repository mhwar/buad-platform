import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubApi } from "../../test-utils";
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
};
const me = (role: string) => () => ({ user: { id: "u", name: "س", email: "s@a.sa", role } });

async function render(role: string) {
  stubApi({
    "GET /api/me": me(role),
    "GET /api/clients": () => ({ items: [item], counts: { association: 1 } }),
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
