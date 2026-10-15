import { effectiveRoleKey, resolveRole } from "@buad/domain";
import { describe, expect, it } from "vitest";
import { activeEntry, badgeFor, buildNav, phoneNav } from "./nav-model";

const permsOf = (legacy: string) => resolveRole(effectiveRoleKey("", legacy), [])!.perms;
const keys = (perms: readonly string[]) => buildNav(perms).map((g) => g.key);
const items = (perms: readonly string[], group: string) =>
  buildNav(perms)
    .find((g) => g.key === group)
    ?.items.map((i) => i.key);

describe("buildNav", () => {
  it("gives the owner every group, in reading order", () => {
    expect(keys(permsOf("owner"))).toEqual(["main", "work", "company", "admin", "soon"]);
    expect(items(permsOf("owner"), "main")).toEqual(["home", "clients", "projects", "finance"]);
    expect(items(permsOf("owner"), "work")).toEqual(["plans", "tasks", "sales", "receivables"]);
    expect(items(permsOf("owner"), "company")).toEqual(["documents", "products", "website"]);
    expect(items(permsOf("owner"), "admin")).toEqual(["team", "activity", "settings"]);
  });

  it("shows «قريباً» tools in their own collapsible group, flagged as soon", () => {
    const soon = buildNav(permsOf("owner")).find((g) => g.key === "soon")!;
    expect(soon.collapsible).toBe(true);
    expect(soon.items.length).toBeGreaterThanOrEqual(7);
    expect(soon.items.every((i) => i.soon)).toBe(true);
  });

  it("hides what a role may not use", () => {
    const member = permsOf("member");
    expect(items(member, "main")).toEqual(["home", "clients", "projects"]); // no finance
    expect(items(member, "admin")).toEqual(["settings"]);
    expect(items(member, "company")).toEqual(["documents"]);
    expect(items(member, "work")).toEqual(["tasks"]);
  });

  it("never returns an empty group", () => {
    expect(buildNav([]).every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("activeEntry and badges", () => {
  const groups = buildNav(permsOf("owner"));
  it("finds the entry for a path, the most specific winning", () => {
    expect(activeEntry(groups, "/")?.key).toBe("home");
    expect(activeEntry(groups, "/projects/p1")?.key).toBe("projects");
    expect(activeEntry(groups, "/more/receivables")?.key).toBe("receivables");
    expect(activeEntry(groups, "/settings/account")?.key).toBe("settings");
    expect(activeEntry(groups, "/nowhere")).toBeNull();
  });
  it("adds up attention counts per entry", () => {
    const counts = { followups: 2, requests: 3, tasks: 1, docs: 4 };
    const get = (k: string) => groups.flatMap((g) => g.items).find((i) => i.key === k)!;
    expect(badgeFor(get("sales"), counts)).toBe(5);
    expect(badgeFor(get("tasks"), counts)).toBe(1);
    expect(badgeFor(get("documents"), counts)).toBe(4);
    expect(badgeFor(get("clients"), counts)).toBe(0);
  });
});

describe("phoneNav", () => {
  it("is four sections plus «المزيد» for finance roles, three for others", () => {
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
  });
});
