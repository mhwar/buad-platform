import { describe, expect, it } from "vitest";
import {
  ALL_PERMS,
  allRoles,
  can,
  DEFAULT_ROLES,
  describeRole,
  effectiveRoleKey,
  normalizePerms,
  resolveRole,
} from "./permissions";

describe("permissions", () => {
  it("has the eight ready-made roles with only valid permissions", () => {
    expect(DEFAULT_ROLES.map((r) => r.key)).toEqual([
      "owner",
      "general-manager",
      "finance-manager",
      "project-manager",
      "sales",
      "accountant",
      "team-member",
      "viewer",
    ]);
    for (const r of DEFAULT_ROLES) for (const p of r.perms) expect(ALL_PERMS).toContain(p);
  });

  it("keeps the legacy behaviour: admin = manager, member = ordinary", () => {
    const gm = resolveRole(effectiveRoleKey("", "admin"), [])!;
    const tm = resolveRole(effectiveRoleKey("", "member"), [])!;
    expect(can(gm.perms, "finance.edit")).toBe(true);
    expect(can(gm.perms, "projects.delete")).toBe(false); // owner only, as before
    expect(can(gm.perms, "team.manage")).toBe(true); // admins invited users
    expect(can(tm.perms, "finance.edit")).toBe(false);
    expect(can(tm.perms, "clients.edit")).toBe(true);
    expect(effectiveRoleKey("sales", "member")).toBe("sales");
  });

  it("lets the organisation edit a ready-made role, but never the owner", () => {
    const o = [
      { key: "viewer", name: "مشاهد", description: "", perms: ["clients.view"], scopes: {} },
    ];
    expect(resolveRole("viewer", o)!.perms).toEqual(["clients.view"]);
    const owner = [{ key: "owner", name: "x", description: "", perms: [], scopes: {} }];
    expect(resolveRole("owner", owner)!.perms).toEqual(ALL_PERMS);
  });

  it("adds custom roles and drops unknown permissions", () => {
    const o = [
      { key: "r-1", name: "مراجع", description: "", perms: ["audit.view", "nope.x"], scopes: {} },
    ];
    const all = allRoles(o);
    expect(all).toHaveLength(9);
    expect(all[8]!.perms).toEqual(["audit.view"]);
  });

  it("an edit permission implies view of the same module", () => {
    expect(normalizePerms(["finance.edit"]).sort()).toEqual(["finance.edit", "finance.view"]);
    expect(normalizePerms(["import.run"])).toEqual(["import.run"]);
  });

  it("describes a role in plain Arabic", () => {
    expect(describeRole(["clients.view", "clients.edit"])).toEqual(["العملاء: عرض، تعديل"]);
  });
});
