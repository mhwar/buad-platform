import { renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { QuickCreate } from "./QuickCreate";
import { _resetRecent, forgetRecent, trackRecent, useRecent } from "./useRecent";

beforeEach(() => {
  localStorage.clear();
  _resetRecent();
});
afterEach(() => vi.unstubAllGlobals());

describe("recent items", () => {
  it("keeps the five most recent, newest first, without duplicates", () => {
    const { result } = renderHook(() => useRecent());
    act(() => {
      for (let i = 1; i <= 7; i++)
        trackRecent({ kind: "project", id: `p${i}`, title: `م${i}`, href: `/projects/p${i}` });
      trackRecent({ kind: "project", id: "p5", title: "م5", href: "/projects/p5" });
    });
    expect(result.current.map((r) => r.id)).toEqual(["p5", "p7", "p6", "p4", "p3"]);
    act(() => forgetRecent("project", "p7"));
    expect(result.current.map((r) => r.id)).toEqual(["p5", "p6", "p4", "p3"]);
    expect(JSON.parse(localStorage.getItem("buad-recent") ?? "[]")).toHaveLength(4);
  });

  it("a renamed record keeps its place with the new title", () => {
    const { result } = renderHook(() => useRecent());
    act(() => {
      trackRecent({ kind: "client", id: "c1", title: "قديم", href: "/clients/c1" });
      trackRecent({ kind: "client", id: "c1", title: "جديد", href: "/clients/c1" });
    });
    expect(result.current).toEqual([
      { kind: "client", id: "c1", title: "جديد", href: "/clients/c1" },
    ]);
  });
});

describe("QuickCreate", () => {
  it("offers only what the role may create", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("member") }) });
    await renderWithApp(<QuickCreate collapsed={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "إنشاء جديد" }));
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    // a member cannot open sales opportunities, but plans meetings and records decisions
    expect(items).toEqual(["عميل", "مشروع", "مهمة", "اجتماع", "قرار"]);
  });

  it("is hidden for someone who can create nothing", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("viewer") }) });
    const { container } = await renderWithApp(<QuickCreate collapsed={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("button")).toBeNull();
  });

  it("opens the client form", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("owner") }) });
    await renderWithApp(<QuickCreate collapsed={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "إنشاء جديد" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "عميل" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
