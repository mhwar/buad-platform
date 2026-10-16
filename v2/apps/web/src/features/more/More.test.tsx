import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ComingSoon, SoonPage } from "./ComingSoon";
import { MoreIndex } from "./MoreIndex";
import { isMorePath, SECTIONS, SOON_TOOLS, tabHref, tabOf, visibleSections } from "./tabs";

afterEach(() => vi.unstubAllGlobals());

describe("section registry", () => {
  it("has unique keys, and every tab a description, a path and a permission or none", () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
    const paths = SECTIONS.flatMap((s) => s.tabs ?? []).map(tabHref);
    expect(new Set(paths).size).toBe(paths.length);
    for (const t of SECTIONS.flatMap((s) => s.tabs ?? [])) {
      expect(t.desc.length).toBeGreaterThan(10);
      expect(t.when.length).toBeGreaterThan(5);
    }
  });

  it("knows the tab a list page belongs to, and nothing for detail pages", () => {
    expect(tabOf("/tasks")?.tab.key).toBe("tasks");
    expect(tabOf("/documents")).toBeNull(); // a section of its own, with no tabs
    expect(tabOf("/products")?.section.key).toBe("planning");
    expect(tabOf("/clients")?.tab.key).toBe("clients");
    expect(tabOf("/sales/quotes")?.tab.key).toBe("opportunities"); // offers live inside «الفرص»
    expect(tabOf("/sales")?.tab.key).toBe("opportunities");
    expect(tabOf("/sales/r1")).toBeNull(); // an opportunity's own page
    expect(tabOf("/projects")).toBeNull();
    expect(tabOf("/")?.tab.key).toBe("today");
    expect(tabOf("/projects/p1")).toBeNull();
    expect(tabOf("/products/prd_1")).toBeNull();
    expect(tabOf("/finance")).toBeNull(); // finance and settings have their own navigation
    expect(tabOf("/settings/team")).toBeNull();
  });

  it("gates sections and tabs by permission", () => {
    const keys = (perms: string[]) => visibleSections(perms).map((s) => s.key);
    expect(keys(meUser("member").perms)).toEqual([
      "home",
      "sales",
      "projects",
      "documents",
      "reports",
      "settings",
      "soon",
    ]);
    expect(keys(meUser("owner").perms)).toContain("sales");
  });

  it("the phone's «المزيد» covers the sections outside the bottom bar", () => {
    expect(isMorePath("/more")).toBe(true);
    expect(isMorePath("/plans")).toBe(true);
    expect(isMorePath("/settings/team")).toBe(true);
    expect(isMorePath("/sales")).toBe(false);
    expect(isMorePath("/projects")).toBe(false);
    expect(isMorePath("/finance")).toBe(false);
  });
});

describe("MoreIndex", () => {
  it("lists the remaining sections with a line each, and no theme switch", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("owner") }) });
    await renderWithApp(<MoreIndex />);
    const planning = await screen.findByRole("link", { name: /التخطيط/ });
    expect(planning).toHaveAttribute("href", "/plans");
    expect(within(planning).getByText(/ما نقدّمه من خدمات/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /الإعدادات/ })).toHaveAttribute(
      "href",
      "/settings/org",
    );
    expect(screen.queryByRole("button", { name: /المظهر/ })).toBeNull();
  });
});

describe("coming soon", () => {
  it("lists every tool on the way as a card", async () => {
    await renderWithApp(<SoonPage />);
    for (const t of SOON_TOOLS)
      expect(await screen.findByRole("link", { name: new RegExp(t.label) })).toBeInTheDocument();
  });
  it("explains one tool, and an unknown key", async () => {
    const { unmount } = await renderWithApp(<ComingSoon tabKey="compliance" />);
    expect(await screen.findByText(/سجل بكل وثيقة/)).toBeInTheDocument();
    unmount();
    await renderWithApp(<ComingSoon tabKey="nope" />);
    expect(await screen.findByText("هذا القسم غير موجود")).toBeInTheDocument();
  });
});
