import { effectiveRoleKey, resolveRole } from "@buad/domain";
import { describe, expect, it } from "vitest";
import { activeChild, activeEntry, badgeFor, buildNav, moreSections, phoneNav } from "./nav-model";

const permsOf = (legacy: string) => resolveRole(effectiveRoleKey("", legacy), [])!.perms;
const keys = (perms: readonly string[]) =>
  buildNav(perms).flatMap((g) => g.items.map((i) => i.key));

describe("buildNav", () => {
  it("gives the owner the work sections, then settings and coming soon at the bottom", () => {
    const groups = buildNav(permsOf("owner"));
    expect(groups.map((g) => g.items.map((i) => i.key))).toEqual([
      ["home", "sales", "projects", "finance", "planning"],
      ["settings", "soon"],
    ]);
  });

  it("opens each section into its pages", () => {
    const owner = buildNav(permsOf("owner")).flatMap((g) => g.items);
    const tabs = (k: string) => owner.find((e) => e.key === k)!.tabs.map((t) => t.key);
    expect(tabs("sales")).toEqual(["pipeline", "clients", "quotes"]);
    expect(tabs("projects")).toEqual(["list", "tasks", "documents"]);
    expect(tabs("finance")).toEqual([
      "projects",
      "quarter",
      "vat",
      "company",
      "partners",
      "receivables",
    ]);
    expect(tabs("planning")).toEqual(["plans", "products", "website"]);
    expect(tabs("settings")).toEqual(["org", "team", "activity", "import", "appearance"]);
    expect(owner.find((e) => e.key === "finance")!.tabs.at(-1)!.href).toBe(
      "/finance?tab=receivables",
    );
  });

  it("hides what a role may not use and sends a section to its first allowed page", () => {
    const member = permsOf("member");
    expect(keys(member)).toEqual(["home", "sales", "projects", "settings", "soon"]);
    const sales = buildNav(member)
      .flatMap((g) => g.items)
      .find((e) => e.key === "sales")!;
    expect(sales.tabs.map((t) => t.key)).toEqual(["clients"]); // clients yes, pipeline and quotes need sales.view
    expect(sales.to).toBe("/clients");
    const salesRole = resolveRole("sales", [])!.perms;
    const s2 = buildNav(salesRole)
      .flatMap((g) => g.items)
      .find((e) => e.key === "sales")!;
    expect(s2.to).toBe("/sales");
    expect(keys(salesRole)).not.toContain("finance");
    const settings = buildNav(member)
      .flatMap((g) => g.items)
      .find((e) => e.key === "settings")!;
    expect(settings.tabs.map((t) => t.key)).toEqual(["org", "appearance"]);
  });

  it("a role with only the website still reaches «التخطيط», at that page", () => {
    const only = ["site.view", "clients.view", "projects.view"];
    const planning = buildNav(only)
      .flatMap((g) => g.items)
      .find((e) => e.key === "planning")!;
    expect(planning.to).toBe("/website");
    expect(planning.tabs.map((t) => t.key)).toEqual(["website"]);
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
    expect(at("/clients")).toBe("sales");
    expect(at("/clients/c1")).toBe("sales");
    expect(at("/sales/quotes")).toBe("sales");
    expect(at("/products/prd_1")).toBe("planning");
    expect(at("/website")).toBe("planning");
    expect(at("/plans")).toBe("planning");
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
    expect(badgeFor(get("planning"), counts)).toBe(7);
    expect(badgeFor(get("home"), counts)).toBe(0);
  });
  it("finds the open page of a section, by path and by ?tab=", () => {
    const get = (k: string) => groups.flatMap((g) => g.items).find((i) => i.key === k)!;
    expect(activeChild(get("finance"), "/finance", {})?.key).toBe("projects");
    expect(activeChild(get("finance"), "/finance", { tab: "vat" })?.key).toBe("vat");
    expect(activeChild(get("finance"), "/finance", { tab: "receivables" })?.key).toBe(
      "receivables",
    );
    expect(activeChild(get("sales"), "/clients", {})?.key).toBe("clients");
    expect(activeChild(get("sales"), "/clients/c1", {})).toBeNull();
  });
});

describe("phone", () => {
  it("keeps the bottom bar, and «المزيد» lists the rest", () => {
    expect(phoneNav(permsOf("owner")).map((i) => i.label)).toEqual([
      "الرئيسية",
      "المبيعات",
      "المشاريع",
      "المالية",
      "المزيد",
    ]);
    expect(phoneNav(permsOf("member")).map((i) => i.label)).toEqual([
      "الرئيسية",
      "المبيعات",
      "المشاريع",
      "المزيد",
    ]);
    expect(moreSections(permsOf("owner")).map((e) => e.key)).toEqual([
      "planning",
      "settings",
      "soon",
    ]);
  });
});
