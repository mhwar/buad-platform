import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import CommandPalette, { matches } from "./CommandPalette";
import { buildNav } from "./nav-model";
import { Sidebar } from "./Sidebar";
import { _resetSidebarMemory, useSidebarCollapsed } from "./useSidebarCollapsed";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  _resetSidebarMemory();
});
beforeEach(() => {
  localStorage.clear();
  _resetSidebarMemory();
});

const owner = meUser("owner");
const attention = {
  ok: true,
  items: [
    { key: "tasks", tone: "warn", title: "مهام", count: 2, link: "/more/tasks" },
    { key: "followups", tone: "warn", title: "م", count: 3, link: "/more/sales" },
    { key: "requests", tone: "warn", title: "ط", count: 1, link: "/more/sales" },
  ],
  checklist: [],
};

describe("Sidebar", () => {
  const routes = (user = owner) => ({
    "GET /api/me": () => ({ ok: true, user }),
    "GET /api/attention": () => attention,
  });

  it("lists the eight sections, settings and coming soon set apart below", async () => {
    stubApi(routes());
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent?.trim().replace(/\d+$/, "")),
    ).toEqual([
      "الرئيسية",
      "العملاء",
      "المبيعات",
      "المشاريع",
      "المالية",
      "الخطط",
      "الإعدادات",
      "قريباً",
    ]);
    expect(within(nav).getByRole("link", { name: /المبيعات/ })).toHaveAttribute("href", "/sales");
    expect(within(nav).getByRole("link", { name: /الإعدادات/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(
      within(nav).queryByRole("link", { name: /الفريق والصلاحيات|التحصيل|المهام/ }),
    ).toBeNull(); // live inside sections
  });

  it("marks the open section and shows live badges of its tabs", async () => {
    stubApi(routes());
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    expect(screen.getByRole("link", { name: "العملاء" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /المبيعات/ })).not.toHaveAttribute("aria-current");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /المبيعات/ })).toHaveTextContent("4"),
    ); // follow-ups + requests
    expect(screen.getByRole("link", { name: /المشاريع/ })).toHaveTextContent("2"); // tasks (the feed has no others)
  });

  it("folds to icons, keeps names accessible, and remembers the choice", async () => {
    stubApi(routes());
    const { unmount } = await renderWithApp(
      <Sidebar groups={buildNav(owner.perms)} activeKey="clients" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    expect(screen.getByRole("link", { name: /^العملاء/ })).toHaveAttribute("title", "العملاء");
    expect(localStorage.getItem("buad-sidebar-collapsed")).toBe("1");
    unmount();
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    expect(screen.getByRole("button", { name: "توسيع القائمة" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a member sees a short list", async () => {
    const member = meUser("member");
    stubApi(routes(member));
    await renderWithApp(<Sidebar groups={buildNav(member.perms)} activeKey="home" />);
    expect(screen.queryByRole("link", { name: "المالية" })).toBeNull();
    expect(screen.queryByRole("link", { name: /المبيعات/ })).toBeNull();
    expect(screen.getByRole("link", { name: /المشاريع/ })).toBeInTheDocument();
  });
});

describe("useSidebarCollapsed", () => {
  it("works when storage is blocked, holding the choice for the visit", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});

describe("CommandPalette", () => {
  const groups = buildNav(owner.perms);
  const setup = async (data = true) => {
    const calls = stubApi({
      "GET /api/clients": (u) => ({
        ok: true,
        items:
          data && u.searchParams.get("q")?.includes("الأمل")
            ? [{ id: "c1", name: "جمعية الأمل", type: "association" }]
            : [],
        counts: {},
      }),
      "GET /api/projects": (u) => ({
        ok: true,
        items:
          data && u.searchParams.get("q")?.includes("الأمل")
            ? [{ id: "p1", name: "ملتقى الأمل", clientName: "جمعية الأمل", status: "active" }]
            : [],
        counts: {},
      }),
    });
    const onOpenChange = vi.fn();
    await renderWithApp(
      <CommandPalette
        open
        onOpenChange={onOpenChange}
        groups={groups}
        canSeeClients
        canSeeProjects
      />,
    );
    return { calls, onOpenChange };
  };

  it("lists sections first, filters them as you type, ignoring hamza and diacritics", async () => {
    await setup();
    const box = screen.getByRole("combobox");
    expect(within(screen.getByRole("listbox")).getAllByRole("option").length).toBeGreaterThan(5);
    await userEvent.type(box, "مهام");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[0]).toHaveTextContent("المشاريع › المهام"); // a tab is found by name, under its section
    expect(matches("الإدارة", "الاداره")).toBe(true);
    expect(matches("مَدرسة", "مدرسه")).toBe(true);
    expect(matches("المبيعات", "تحصيل")).toBe(false);
  });

  it("finds clients and projects by name and moves with the arrows", async () => {
    const { calls } = await setup();
    await userEvent.type(screen.getByRole("combobox"), "الأمل");
    // the client itself, and the project that shows its client's name
    expect(await screen.findAllByRole("option", { name: /جمعية الأمل/ })).toHaveLength(2);
    expect(await screen.findByRole("option", { name: /ملتقى الأمل/ })).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/clients")).toBe(true);
    const box = screen.getByRole("combobox");
    const first = box.getAttribute("aria-activedescendant");
    await userEvent.keyboard("{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  it("says so when nothing matches, and does not search for one letter", async () => {
    const { calls } = await setup(false);
    await userEvent.type(screen.getByRole("combobox"), "ي");
    expect(calls.some((c) => c.path === "/api/clients")).toBe(false);
    await userEvent.type(screen.getByRole("combobox"), "ظظظظ");
    expect(await screen.findByText(/لا نتائج/)).toBeInTheDocument();
  });
});
