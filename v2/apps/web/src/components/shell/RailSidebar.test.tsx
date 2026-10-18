import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { buildNav } from "./nav-model";
import { RailSidebar } from "./RailSidebar";
import { _resetSidebarMemory } from "./useSidebarCollapsed";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  _resetSidebarMemory();
});

const owner = meUser("owner");
const routes = {
  "GET /api/me": () => ({ ok: true, user: owner }),
  "GET /api/attention": () => ({
    ok: true,
    items: [
      { key: "followups", tone: "warn", title: "م", count: 3, link: "/more/sales" },
      { key: "requests", tone: "warn", title: "ط", count: 1, link: "/more/sales" },
    ],
    checklist: [],
  }),
};
const render = (activeKey: string) =>
  renderWithApp(
    <RailSidebar
      groups={buildNav(owner.perms)}
      activeKey={activeKey}
      user={{ name: "سلطان", role: "المالك" }}
      onLogout={() => {}}
    />,
  );

describe("RailSidebar", () => {
  it("lists every section on the rail and marks the current one", async () => {
    stubApi(routes);
    await render("finance");
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    const links = within(nav)
      .getAllByRole("link")
      .filter((l) => l.hasAttribute("data-section"));
    expect(links.map((l) => l.getAttribute("title"))).toEqual([
      "مساحة العمل",
      "المبيعات",
      "المشاريع",
      "المستندات",
      "المالية",
      "التقارير",
      "التخطيط",
      "الإعدادات",
      "قريباً",
    ]);
    expect(within(nav).getByTitle("المالية")).toHaveAttribute("aria-current", "page");
  });

  it("the panel shows the open section's pages with their counts", async () => {
    stubApi(routes);
    await render("sales");
    expect(screen.getByRole("heading", { name: "المبيعات" })).toBeInTheDocument();
    const pages = screen.getByRole("navigation", { name: "صفحات المبيعات" });
    expect(within(pages).getByRole("link", { name: "العملاء" })).toHaveAttribute(
      "href",
      "/clients",
    );
    await waitFor(() =>
      expect(within(pages).getByRole("link", { name: /الفرص/ })).toHaveTextContent("4"),
    );
    // the rail carries the section's total for when the panel is folded
    expect(screen.getByRole("link", { name: "المبيعات، 4" })).toBeInTheDocument();
  });

  it("folds the panel, keeps the rail, and remembers the choice", async () => {
    stubApi(routes);
    const { unmount } = await render("sales");
    await userEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    expect(screen.queryByRole("navigation", { name: "صفحات المبيعات" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "الأقسام" })).toBeInTheDocument();
    expect(localStorage.getItem("buad-sidebar-collapsed")).toBe("1");
    unmount();
    await render("sales");
    expect(screen.getByRole("button", { name: "توسيع القائمة" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
