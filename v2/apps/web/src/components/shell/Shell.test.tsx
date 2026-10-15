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

  it("groups every tool under a heading, soon tools included but folded", async () => {
    stubApi(routes());
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    for (const h of ["الأساسي", "إدارة العمل", "الشركة", "الإدارة"])
      expect(within(nav).getByRole("heading", { name: h })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /الخطط/ })).toHaveAttribute("href", "/more/plans");
    const soon = within(nav).getByRole("button", { name: /قريباً/ });
    expect(soon).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).queryByRole("link", { name: /الموارد البشرية/ })).toBeNull();
    await userEvent.click(soon);
    expect(within(nav).getByRole("link", { name: /الموارد البشرية/ })).toBeInTheDocument();
  });

  it("marks the open section and shows live badges", async () => {
    stubApi(routes());
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    expect(screen.getByRole("link", { name: "العملاء" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /الخطط/ })).not.toHaveAttribute("aria-current");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /المبيعات/ })).toHaveTextContent("4"),
    ); // follow-ups + requests
    expect(screen.getByRole("link", { name: /المهام/ })).toHaveTextContent("2");
  });

  it("opens the folded group when one of its pages is the current one", async () => {
    stubApi(routes());
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="hr" />);
    expect(screen.getByRole("link", { name: /الموارد البشرية/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("folds to icons, keeps names accessible, and remembers the choice", async () => {
    stubApi(routes());
    const { unmount } = await renderWithApp(
      <Sidebar groups={buildNav(owner.perms)} activeKey="clients" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    expect(screen.getByRole("link", { name: /^العملاء/ })).toHaveAttribute("title", "العملاء");
    expect(screen.queryByText("إدارة العمل")).toBeNull();
    expect(localStorage.getItem("buad-sidebar-collapsed")).toBe("1");
    unmount();
    await renderWithApp(<Sidebar groups={buildNav(owner.perms)} activeKey="clients" />);
    expect(screen.getByRole("button", { name: "توسيع القائمة" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a member sees only what their role allows", async () => {
    const member = meUser("member");
    stubApi(routes(member));
    await renderWithApp(<Sidebar groups={buildNav(member.perms)} activeKey="home" />);
    expect(screen.queryByRole("link", { name: "المالية" })).toBeNull();
    expect(screen.queryByRole("link", { name: /الفريق والصلاحيات/ })).toBeNull();
    expect(screen.getByRole("link", { name: /المهام/ })).toBeInTheDocument();
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
    expect(options[0]).toHaveTextContent("المهام"); // the name match leads, mentions in descriptions follow
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
