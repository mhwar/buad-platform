import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ComingSoon } from "./ComingSoon";
import { MoreIndex } from "./MoreIndex";
import { inHub, MORE_TABS, tabOf, visibleTabs } from "./tabs";

afterEach(() => vi.unstubAllGlobals());

describe("hub registry", () => {
  it("every tab has a description and a unique key and path", () => {
    expect(new Set(MORE_TABS.map((t) => t.key)).size).toBe(MORE_TABS.length);
    expect(new Set(MORE_TABS.map((t) => t.to)).size).toBe(MORE_TABS.length);
    for (const t of MORE_TABS) {
      expect(t.desc.length).toBeGreaterThan(10);
      expect(t.when.length).toBeGreaterThan(5);
      if (t.soon) expect(t.will?.length).toBeGreaterThan(0);
    }
  });

  it("knows which pages belong to the hub", () => {
    expect(tabOf("/documents")?.key).toBe("documents");
    expect(tabOf("/settings/account")?.key).toBe("settings");
    expect(tabOf("/more/soon/hr")?.key).toBe("hr");
    expect(inHub("/more")).toBe(true);
    expect(inHub("/products")).toBe(true);
    expect(inHub("/products/prd_1")).toBe(false); // the builder is full screen
    expect(inHub("/clients")).toBe(false);
  });

  it("gates tabs by permission", () => {
    const member = meUser("member").perms;
    const keys = visibleTabs(member).map((t) => t.key);
    expect(keys).toContain("documents");
    expect(keys).not.toContain("team");
    expect(keys).not.toContain("products");
    expect(visibleTabs(meUser("owner").perms).map((t) => t.key)).toContain("team");
  });
});

describe("MoreIndex", () => {
  it("lists tabs with their descriptions and marks the coming ones", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("owner") }) });
    await renderWithApp(<MoreIndex />);
    const team = await screen.findByRole("link", { name: /الفريق والصلاحيات/ });
    expect(team).toHaveAttribute("href", "/more/team");
    expect(within(team).getByText(/من يدخل المنصة/)).toBeInTheDocument();
    const hr = screen.getByRole("link", { name: /الموارد البشرية/ });
    expect(within(hr).getByText("قريباً")).toBeInTheDocument();
  });

  it("a member does not see admin tabs", async () => {
    stubApi({ "GET /api/me": () => ({ ok: true, user: meUser("member") }) });
    await renderWithApp(<MoreIndex />);
    await screen.findByRole("link", { name: /المستندات/ });
    expect(screen.queryByRole("link", { name: /الفريق والصلاحيات/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /سجل النشاط/ })).toBeNull();
  });
});

describe("ComingSoon", () => {
  it("shows what the section will hold, and no numbers", async () => {
    await renderWithApp(<ComingSoon tabKey="compliance" />);
    expect(await screen.findByText(/سجل بكل وثيقة/)).toBeInTheDocument();
  });
  it("explains an unknown key", async () => {
    await renderWithApp(<ComingSoon tabKey="nope" />);
    expect(await screen.findByText("هذا القسم غير موجود")).toBeInTheDocument();
  });
});
