import { effectiveRoleKey, resolveRole } from "@buad/domain";
import { describe, expect, it } from "vitest";
import { activeChild, activeEntry, badgeFor, buildNav, moreSections, phoneNav } from "./nav-model";

const permsOf = (legacy: string) => resolveRole(effectiveRoleKey("", legacy), [])!.perms;
const flat = (perms: readonly string[]) => buildNav(perms).flatMap((g) => g.items);
const keys = (perms: readonly string[]) => flat(perms).map((i) => i.key);

describe("buildNav", () => {
  it("orders the work by the day: workspace, sales, projects, documents, finance, planning; then settings and coming soon", () => {
    expect(buildNav(permsOf("owner")).map((g) => g.items.map((i) => i.key))).toEqual([
      ["home", "sales", "projects", "documents", "finance", "reports", "planning"],
      ["settings", "soon"],
    ]);
  });

  it("gives each section its pages, and keeps projects and documents single", () => {
    const tabs = (k: string) =>
      flat(permsOf("owner"))
        .find((e) => e.key === k)!
        .tabs.map((t) => t.key);
    expect(tabs("home")).toEqual(["today", "tasks", "meetings", "decisions"]);
    expect(tabs("projects")).toEqual([]);
    expect(tabs("documents")).toEqual([]);
    expect(tabs("finance")).toEqual([
      "projects",
      "review",
      "quarter",
      "vat",
      "company",
      "partners",
      "receivables",
    ]);
    expect(tabs("planning")).toEqual(["plans", "products", "website"]);
    expect(tabs("settings")).toEqual([
      "overview",
      "org",
      "finance",
      "team",
      "activity",
      "import",
      "account",
    ]);
  });

  it("each section has its own colour tile", () => {
    const tints = flat(permsOf("owner")).map((e) => e.tint);
    expect(new Set(tints.slice(0, 6)).size).toBe(6);
  });

  it("hides what a role may not use and sends a section to its first allowed page", () => {
    const member = permsOf("member");
    expect(keys(member)).toEqual([
      "home",
      "sales",
      "projects",
      "documents",
      "reports",
      "settings",
      "soon",
    ]);
    const sales = flat(member).find((e) => e.key === "sales")!;
    expect(sales.to).toBe("/clients"); // the pipeline needs sales.view
    expect(keys(resolveRole("sales", [])!.perms)).not.toContain("finance");
  });

  it("never returns an empty block", () => {
    expect(buildNav([]).every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("activeEntry and badges", () => {
  const groups = buildNav(permsOf("owner"));
  const at = (p: string) => activeEntry(groups, p)?.key;
  it("finds the section for any of its pages, details included", () => {
    expect(at("/")).toBe("home");
    expect(at("/tasks")).toBe("home");
    expect(at("/projects/p1")).toBe("projects");
    expect(at("/documents")).toBe("documents");
    expect(at("/projects/p1/documents/d1")).toBe("projects"); // a document opens inside its project
    expect(at("/clients/c1")).toBe("sales");
    expect(at("/products/prd_1")).toBe("planning");
    expect(at("/settings/team")).toBe("settings");
    expect(at("/more/soon/hr")).toBe("soon");
    expect(at("/nowhere")).toBeUndefined();
  });
  it("adds attention counts per section", () => {
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
    expect(badgeFor(get("home"), counts)).toBe(1);
    expect(badgeFor(get("sales"), counts)).toBe(5);
    expect(badgeFor(get("projects"), counts)).toBe(5);
    expect(badgeFor(get("documents"), counts)).toBe(4);
    expect(badgeFor(get("finance"), counts)).toBe(6);
    expect(badgeFor(get("planning"), counts)).toBe(7);
  });
  it("finds the open page of a section, by path and by ?tab=", () => {
    const get = (k: string) => groups.flatMap((g) => g.items).find((i) => i.key === k)!;
    expect(activeChild(get("finance"), "/finance", {})?.key).toBe("projects");
    expect(activeChild(get("finance"), "/finance", { tab: "receivables" })?.key).toBe(
      "receivables",
    );
    expect(activeChild(get("home"), "/tasks", {})?.key).toBe("tasks");
    expect(activeChild(get("sales"), "/clients/c1", {})).toBeNull();
  });
});

describe("phone", () => {
  it("keeps a short bottom bar, and «المزيد» lists the rest", () => {
    expect(phoneNav(permsOf("owner")).map((i) => i.label)).toEqual([
      "اليوم",
      "المبيعات",
      "المشاريع",
      "المالية",
      "المزيد",
    ]);
    // a member without sales gets «العملاء» in its place, straight to the clients
    expect(phoneNav(permsOf("member")).map((i) => i.label)).toEqual([
      "اليوم",
      "العملاء",
      "المشاريع",
      "المزيد",
    ]);
    expect(moreSections(permsOf("owner")).map((e) => e.key)).toEqual([
      "documents",
      "reports",
      "planning",
      "settings",
      "soon",
    ]);
  });
});
