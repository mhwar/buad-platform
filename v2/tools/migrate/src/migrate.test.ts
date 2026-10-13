import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planMigration, toReport, toSql } from "./index";
import { djb2 } from "./plan";

const fixture = JSON.parse(readFileSync(join(__dirname, "../fixtures/v1-sample.json"), "utf8"));

function freshDb() {
  const db = new Database(":memory:");
  const dir = join(__dirname, "../../../apps/api/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const s of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint"))
      if (s.trim()) db.exec(s);
  }
  return db;
}
const apply = (db: Database.Database, sql: string[]) =>
  db.transaction(() => sql.forEach((s) => db.exec(s)))();

describe("planMigration", () => {
  const plan = planMigration(fixture);

  it("maps staff, associations and members into the right orgs and roles", () => {
    const by = (id: string) => plan.users.find((u) => u.id === id);
    expect(by("usr_admin_1")).toMatchObject({
      orgId: "org_platform",
      role: "admin",
      email: "sultan@example.com",
    });
    expect(by("usr_2")).toMatchObject({ role: "member", mustChangePass: true, legacyHash: "" });
    expect(by("own_org_a")).toMatchObject({ orgId: "org_a", role: "owner", legacyHash: "375x4r" });
    expect(by("mem_1")).toMatchObject({ orgId: "org_a", role: "admin" });
    expect(by("mem_2")).toMatchObject({ orgId: "org_a", role: "member" });
  });

  it("rejects bad rows by name instead of dropping them silently", () => {
    const reasons = Object.fromEntries(plan.rejects.map((r) => [r.id, r.reason]));
    expect(reasons.usr_bad).toMatch(/بريد/);
    expect(reasons.org_b).toMatch(/بلا اسم/);
    expect(reasons.org_c).toMatch(/مكرر/);
    expect(reasons.mem_3).toMatch(/غير موجودة/);
    expect(plan.users.map((u) => u.id)).not.toContain("mem_3");
  });

  it("treats djb2('__pending__'+id) as 'no password yet'", () => {
    const p = planMigration({
      users: [{ id: "u9", email: "p@x.sa", name: "p", password_hash: djb2("__pending__u9") }],
    });
    expect(p.users[0]).toMatchObject({ mustChangePass: true, legacyHash: "" });
  });

  it("inventories the workspace blob, tolerating bad JSON", () => {
    expect(plan.inventory).toMatchObject({ clients: 3, projects: 2, templates: 0 });
    expect(planMigration({ workspace: "{oops" }).inventory._error).toBeTruthy();
    expect(planMigration({}).users).toEqual([]);
  });

  it("writes a readable report listing every reject", () => {
    const md = toReport(plan);
    for (const r of plan.rejects) expect(md).toContain(r.id);
    expect(md).toContain("مرفوض");
  });
});

describe("toSql", () => {
  it("imports into the real v2 schema and is idempotent", () => {
    const db = freshDb();
    const sql = toSql(planMigration(fixture));
    apply(db, sql);
    const count = (t: string) =>
      (db.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
    const first = { orgs: count("orgs"), users: count("users"), map: count("legacy_map") };
    expect(first.users).toBe(5);
    apply(db, sql);
    expect({ orgs: count("orgs"), users: count("users"), map: count("legacy_map") }).toEqual(first);
  });

  it("escapes quotes safely", () => {
    const db = freshDb();
    apply(
      db,
      toSql(
        planMigration({
          orgs: [{ id: "o'1", name: "جمعية 'الأمل'; DROP TABLE users;--", email: "q@x.sa" }],
        }),
      ),
    );
    expect(
      (db.prepare("select name from orgs where id=?").get("o'1") as { name: string }).name,
    ).toContain("DROP TABLE");
    expect((db.prepare("select count(*) c from users").get() as { c: number }).c).toBe(1);
  });

  it("re-import never overwrites a password already upgraded in v2", () => {
    const db = freshDb();
    const sql = toSql(planMigration(fixture));
    apply(db, sql);
    db.prepare(
      "update users set password_hash='pbkdf2$x', legacy_hash='' where id='usr_admin_1'",
    ).run();
    apply(db, sql);
    const row = db
      .prepare("select password_hash, legacy_hash from users where id='usr_admin_1'")
      .get() as Record<string, string>;
    expect(row).toEqual({ password_hash: "pbkdf2$x", legacy_hash: "" });
  });
});
