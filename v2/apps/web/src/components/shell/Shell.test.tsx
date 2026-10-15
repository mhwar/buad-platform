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
  const render = (user = owner, activeKey = "clients") =>
    renderWithApp(
      <Sidebar
        groups={buildNav(user.perms)}
        activeKey={activeKey}
        user={{ name: "سلطان", role: "المالك" }}
        onLogout={() => {}}
      />,
    );

  it("puts the account on top, the sections in the middle and settings at the bottom", async () => {
    stubApi(routes());
    await render();
    const account = screen.getByRole("button", { name: "حساب سلطان" });
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    expect(account.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const names = within(nav)
      .getAllByRole("link")
      .filter((l) => l.hasAttribute("data-section"));
    expect(names.map((l) => l.textContent?.trim().replace(/\d+$/, ""))).toEqual([
      "مساحة العمل",
      "المبيعات",
      "المشاريع",
      "المستندات",
      "المالية",
      "التخطيط",
      "الإعدادات",
      "قريباً",
    ]);
  });

  it("opens the current section into its pages and marks the open one", async () => {
    stubApi(routes());
    await render(owner, "sales");
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    // the current section is open by default; others are closed
    expect(within(nav).getByRole("button", { name: "طيّ المبيعات" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(nav).getByRole("button", { name: "فتح مساحة العمل" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(nav).getByRole("link", { name: "العملاء" })).toHaveAttribute("href", "/clients");
    expect(within(nav).queryByRole("link", { name: /مهامي/ })).toBeNull();
    await userEvent.click(within(nav).getByRole("button", { name: "فتح مساحة العمل" }));
    expect(within(nav).getByRole("link", { name: /مهامي/ })).toHaveAttribute("href", "/tasks");
    await userEvent.click(within(nav).getByRole("button", { name: "طيّ المبيعات" }));
    expect(within(nav).queryByRole("link", { name: "العملاء" })).toBeNull();
  });

  it("keeps the products, website and settings pages under their sections", async () => {
    stubApi(routes());
    await render(owner, "planning");
    const nav = screen.getByRole("navigation", { name: "الأقسام" });
    expect(within(nav).getByRole("link", { name: "المنتجات والخدمات" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(within(nav).getByRole("link", { name: "الموقع" })).toHaveAttribute("href", "/website");
    await userEvent.click(within(nav).getByRole("button", { name: "فتح الإعدادات" }));
    for (const l of ["بيانات الجهة", "الفريق والصلاحيات", "سجل النشاط", "المظهر"])
      expect(within(nav).getByRole("link", { name: l })).toBeInTheDocument();
  });

  it("shows live badges: on the section while closed, on the page when open", async () => {
    stubApi(routes());
    await render(owner, "home");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /المبيعات/ })).toHaveTextContent("4"),
    ); // follow-ups + requests
    await userEvent.click(screen.getByRole("button", { name: "فتح المبيعات" }));
    expect(screen.getByRole("link", { name: /الفرص/ })).toHaveTextContent("4"); // new requests + follow-ups due
  });

  it("the account menu offers the account page and sign-out", async () => {
    stubApi(routes());
    await render();
    await userEvent.click(screen.getByRole("button", { name: "حساب سلطان" }));
    expect(await screen.findByRole("menuitem", { name: /حسابي/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /تسجيل الخروج/ })).toBeInTheDocument();
  });

  it("folds to icons, keeps names accessible, and remembers the choice", async () => {
    stubApi(routes());
    const { unmount } = await render();
    await userEvent.click(screen.getByRole("button", { name: "طيّ القائمة" }));
    expect(screen.getByRole("button", { name: /^المبيعات/ })).toHaveAttribute("title", "المبيعات");
    expect(localStorage.getItem("buad-sidebar-collapsed")).toBe("1");
    unmount();
    await render();
    expect(screen.getByRole("button", { name: "توسيع القائمة" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a member sees a short list", async () => {
    const member = meUser("member");
    stubApi(routes(member));
    await render(member, "home");
    expect(screen.queryByRole("link", { name: "المالية" })).toBeNull();
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
    expect(options[0]).toHaveTextContent("مساحة العمل › مهامي"); // a tab is found by name, under its section
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

  it("finds opportunities and meetings too, for those who may see them", async () => {
    stubApi({
      "GET /api/clients": () => ({ ok: true, items: [], counts: {} }),
      "GET /api/projects": () => ({ ok: true, items: [], counts: {} }),
      "GET /api/product-requests": () => ({
        ok: true,
        counts: {},
        requests: [
          { id: "r1", name: "منى", entity: "جمعية النور", productName: "تدريب", interest: false },
        ],
      }),
      "GET /api/meetings": () => ({
        ok: true,
        items: [{ id: "m1", title: "اجتماع النور", startsAt: "2030-01-01T10:00" }],
      }),
    });
    await renderWithApp(
      <CommandPalette
        open
        onOpenChange={() => {}}
        groups={groups}
        canSeeClients
        canSeeProjects
        canSeeSales
        canSeeMeetings
      />,
    );
    await userEvent.type(screen.getByRole("combobox"), "النور");
    expect(await screen.findByRole("option", { name: /جمعية النور/ })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /اجتماع النور/ })).toBeInTheDocument();
  });

  it("says so when nothing matches, and does not search for one letter", async () => {
    const { calls } = await setup(false);
    await userEvent.type(screen.getByRole("combobox"), "ي");
    expect(calls.some((c) => c.path === "/api/clients")).toBe(false);
    await userEvent.type(screen.getByRole("combobox"), "ظظظظ");
    expect(await screen.findByText(/لا نتائج/)).toBeInTheDocument();
  });
});
