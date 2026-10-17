import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import { SectionTabs } from "./SectionTabs";

afterEach(() => vi.unstubAllGlobals());

async function at(path: string, role = "owner") {
  stubApi({
    "GET /api/me": () => ({ ok: true, user: meUser(role) }),
    "GET /api/attention": () => ({
      ok: true,
      checklist: [],
      items: [
        { key: "tasks", tone: "warn", title: "m", count: 3, link: "/tasks" },
        { key: "docs", tone: "info", title: "d", count: 2, link: "/documents" },
      ],
    }),
  });
  const root = createRootRoute({ component: SectionTabs });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

describe("SectionTabs", () => {
  it("shows the section's tabs with live counts, the open one marked, and what it is for", async () => {
    await at("/tasks");
    const tabs = await screen.findByRole("tablist", { name: "مساحة العمل" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent?.replace(/\d+$/, "")),
    ).toEqual(["اليوم", "مهامي", "الاجتماعات", "القرارات"]);
    expect(within(tabs).getByRole("tab", { name: /مهامي/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(tabs).getByRole("tab", { name: /مهامي/ })).toHaveTextContent("3");
    // The page's own header says what it is for; the strip does not repeat it.
    expect(screen.queryByText(/متى تستخدمه/)).toBeNull();
  });

  it("offers the planning tabs: plans, products and the website", async () => {
    await at("/products");
    const tabs = await screen.findByRole("tablist", { name: "التخطيط" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["الخطط", "المنتجات والخدمات", "الموقع"]);
  });

  it("only lists the tabs a role may open", async () => {
    await at("/", "viewer");
    const tabs = await screen.findByRole("tablist", { name: "مساحة العمل" });
    expect(within(tabs).getAllByRole("tab")).toHaveLength(4); // viewers may read tasks and meetings
  });

  it("is absent on detail pages and on pages without tabs", async () => {
    await at("/projects/p1");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});
