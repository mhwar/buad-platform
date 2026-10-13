import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planBusiness, planMigration, toReport, toSql } from "./index";

const ws = JSON.parse(readFileSync(join(__dirname, "../fixtures/v1-workspace.json"), "utf8"));
const b = planBusiness(ws);

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const dir = join(__dirname, "../../../apps/api/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const s of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint"))
      if (s.trim()) db.exec(s);
  return db;
}
const apply = (db: Database.Database, sql: string[]) =>
  db.transaction(() => sql.forEach((s) => db.exec(s)))();

describe("planBusiness (v1 clients & projects)", () => {
  it("codes clients in creation order and keeps v1 ids", () => {
    expect(b.clients.map((c) => [c.id, c.code])).toEqual([
      ["c1", "CL-0001"],
      ["c2", "CL-0002"],
      ["c3", "CL-0003"],
      ["c4", "CL-0004"],
      ["c6", "CL-0005"],
    ]);
  });

  it("maps fields, merges the 100-day key variants, lower-cases email", () => {
    const by = (id: string) => b.clients.find((c) => c.id === id);
    expect(by("c1")).toMatchObject({
      email: "info@ufuq.sa",
      city: "الرياض",
      logo: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(by("c3")?.notes).toBe("أُنشئ من خطة المئة يوم");
    expect(b.contacts).toEqual([
      expect.objectContaining({ clientId: "c2", name: "أحمد", title: "الرئيس" }),
      expect.objectContaining({ clientId: "c3", name: "سارة" }),
    ]);
  });

  it("fixes or rejects bad rows and says why", () => {
    const issue = (id: string) =>
      b.issues
        .filter((i) => i.id === id)
        .map((i) => `${i.severity}:${i.reason}`)
        .join(" | ");
    expect(issue("c4")).toMatch(/fixed:رقم السجل 111 مكرر/);
    expect(issue("c4")).toMatch(/fixed:نوع غير معروف/);
    expect(b.clients.find((c) => c.id === "c4")).toMatchObject({ regNo: "", type: "other" });
    expect(issue("c5")).toMatch(/rejected:عميل بلا اسم/);
    expect(issue("c6")).toMatch(/fixed:الشعار/);
    expect(issue("p4")).toMatch(/rejected:.*يتيم/);
    expect(issue("p3")).toMatch(/fixed:تاريخ الانتهاء قبل البداية/);
    expect(issue("p5")).toMatch(/fixed:حالة غير معروفة/);
  });

  it("numbers projects per year, merges notes, takes value from fin then from the form", () => {
    const by = (id: string) => b.projects.find((p) => p.id === id);
    expect(b.projects.map((p) => p.number)).toEqual([
      "PRJ-2025-0001",
      "PRJ-2025-0002",
      "PRJ-2025-0003",
      "PRJ-2026-0001",
    ]);
    expect(by("p1")).toMatchObject({
      expectedValue: 11500050,
      notes: "أ\n\nب",
      ownerId: "usr_admin_1",
      visibility: "team",
    });
    expect(by("p2")).toMatchObject({
      expectedValue: 500000,
      visibility: "private",
      status: "completed",
    });
    expect(by("p3")).toMatchObject({ startDate: "2025-05-01", endDate: "" });
    expect(by("p5")?.status).toBe("active");
    expect(b.counters).toEqual([
      { kind: "client", year: 0, value: 5 },
      { kind: "project", year: 2025, value: 3 },
      { kind: "project", year: 2026, value: 1 },
    ]);
  });
});

describe("importing into the real v2 schema", () => {
  const plan = planMigration({ workspace: JSON.stringify(ws) });

  it("applies cleanly, is idempotent, and never rewrites codes", () => {
    const db = freshDb();
    apply(db, toSql(plan));
    const count = (t: string) =>
      (db.prepare(`select count(*) c from ${t}`).get() as { c: number }).c;
    expect([count("clients"), count("projects"), count("client_contacts")]).toEqual([5, 4, 2]);
    db.prepare("update clients set phone='edited-in-v2' where id='c1'").run();
    apply(db, toSql(plan));
    expect([count("clients"), count("projects"), count("client_contacts")]).toEqual([5, 4, 2]);
    expect(
      (db.prepare("select code from clients where id='c2'").get() as { code: string }).code,
    ).toBe("CL-0002");
  });

  it("sets counters so new v2 records continue after the imported ones", () => {
    const db = freshDb();
    db.exec("INSERT INTO org_counters VALUES ('org_platform','client',0,9)");
    apply(db, toSql(plan));
    const v = (kind: string, year: number) =>
      (
        db.prepare("select value from org_counters where kind=? and year=?").get(kind, year) as {
          value: number;
        }
      ).value;
    expect(v("client", 0)).toBe(9); // never goes backwards
    expect(v("project", 2025)).toBe(3);
  });

  it("report lists every rejected and corrected row", () => {
    const md = toReport(plan);
    for (const i of plan.business.issues) expect(md).toContain(i.id);
    expect(md).toContain("عملاء سيُنقلون: **5**");
  });

  it("tolerates a workspace with no clients or projects", () => {
    expect(planBusiness({}).clients).toEqual([]);
    expect(planMigration({ workspace: "{bad" }).business.projects).toEqual([]);
  });
});
