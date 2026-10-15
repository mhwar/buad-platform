import { effectiveRoleKey, resolveRole } from "@buad/domain";
import { describe, expect, it } from "vitest";
import { activeEntry, badgeFor, buildNav, moreSections, phoneNav } from "./nav-model";

const permsOf = (legacy: string) => resolveRole(effectiveRoleKey("", legacy), [])!.perms;
const keys = (perms: readonly string[]) =>
  buildNav(perms).flatMap((g) => g.items.map((i) => i.key));

describe("buildNav", () => {
  it("gives the owner eight entries in two blocks: the work, then settings and coming soon", () => {
    const groups = buildNav(permsOf("owner"));
    expect(groups.map((g) => g.items.map((i) => i.key))).toEqual([
      ["home", "clients", "sales", "projects", "finance", "plans"],
      ["settings", "soon"],
    ]);
  });

  it("folds the former tabs into their sections", () => {
    const owner = buildNav(permsOf("owner")).flatMap((g) => g.items);
    const tabs = (k: string) => owner.find((e) => e.key === k)!.tabs.map((t) => t.to);
    expect(tabs("sales")).toEqual(["/sales", "/products", "/website"]);
    expect(tabs("projects")).toEqual(["/projects", "/tasks", "/documents"]);
    expect(keys(permsOf("owner"))).not.toContain("team"); // lives in settings now
    expect(keys(permsOf("owner"))).not.toContain("receivables"); // lives in finance
  });

  it("hides what a role may not use and sends a section to its first allowed tab", () => {
    const member = permsOf("member");
    expect(keys(member)).toEqual(["home", "clients", "projects", "settings", "soon"]);
    const projects = buildNav(member)
      .flatMap((g) => g.items)
      .find((e) => e.key === "projects")!;
    expect(projects.tabs.map((t) => t.key)).toEqual(["list", "tasks", "documents"]);
    // sales role: no finance, no plans, sales opens on the pipeline
    const sales = permsOf("member");
    expect(sales).not.toContain("sales.view");
    const salesRole = resolveRole("sales", [])!.perms;
    expect(
      buildNav(salesRole)
        .flatMap((g) => g.items)
        .find((e) => e.key === "sales")!.to,
    ).toBe("/sales");
    expect(keys(salesRole)).not.toContain("finance");
  });

  it("a role with only the website still reaches «المبيعات», at that tab", () => {
    const only = ["site.view", "clients.view", "projects.view"];
    const sales = buildNav(only)
      .flatMap((g) => g.items)
      .find((e) => e.key === "sales")!;
    expect(sales.to).toBe("/website");
    expect(sales.tabs.map((t) => t.key)).toEqual(["website"]);
  });

  it("never returns an empty block", () => {
    expect(buildNav([]).every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("activeEntry and badges", () => {
  const groups = buildNav(permsOf("owner"));
  it("finds the section for any of its pages, details included", () => {
    const at = (p: string) => activeEntry(groups, p)?.key;
    expect(at("/")).toBe("home");
    expect(at("/projects/p1")).toBe("projects");
    expect(at("/tasks")).toBe("projects");
    expect(at("/documents")).toBe("projects");
    expect(at("/products/prd_1")).toBe("sales");
    expect(at("/website")).toBe("sales");
    expect(at("/finance")).toBe("finance");
    expect(at("/settings/team")).toBe("settings");
    expect(at("/more/soon/hr")).toBe("soon");
    expect(at("/nowhere")).toBeUndefined();
  });
  it("adds attention counts of the section's tabs", () => {
    const counts = {
      followups: 2,
      requests: 3,
      tasks: 1,
      docs: 4,
      overdue: 5,
      instalments: 6,
      initiatives: 7,
    };
    const get = (k: string) => groups.flatMap((g) => g.items).find((i) => i.key === k)!;
    expect(badgeFor(get("sales"), counts)).toBe(5);
    expect(badgeFor(get("projects"), counts)).toBe(10); // overdue + tasks + docs
    expect(badgeFor(get("finance"), counts)).toBe(6);
    expect(badgeFor(get("plans"), counts)).toBe(7);
    expect(badgeFor(get("clients"), counts)).toBe(0);
  });
});

describe("phone", () => {
  it("keeps the bottom bar, and «المزيد» lists the rest", () => {
    expect(phoneNav(permsOf("owner")).map((i) => i.label)).toEqual([
      "الرئيسية",
      "العملاء",
      "المشاريع",
      "المالية",
      "المزيد",
    ]);
    expect(phoneNav(permsOf("member")).map((i) => i.label)).toEqual([
      "الرئيسية",
      "العملاء",
      "المشاريع",
      "المزيد",
    ]);
    expect(moreSections(permsOf("owner")).map((e) => e.key)).toEqual([
      "sales",
      "plans",
      "settings",
      "soon",
    ]);
  });
});
