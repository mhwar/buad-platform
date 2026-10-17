import * as schema from "@buad/schema/db";
import { eq, getTableColumns, getTableName, inArray } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { assetUrl } from "./assets";
import { audit } from "./audit";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type AnyTable = SQLiteTable & Record<string, any>;

/** Columns never written to an export: secrets, not data. */
const SECRET = /hash|token|secret/i;

/** Tables without an org column, read through their parent's rows. */
const CHILDREN: [child: AnyTable, column: string, parent: AnyTable][] = [
  [schema.clientContacts, "clientId", schema.clients],
  [schema.financeBudgetItems, "projectId", schema.projects],
  [schema.financeCategories, "projectId", schema.projects],
  [schema.documentVersions, "documentId", schema.documents],
  [schema.distributionShares, "distributionId", schema.distributions],
  [schema.distributionProjects, "distributionId", schema.distributions],
  [schema.projectMembers, "projectId", schema.projects],
];
const SKIP = new Set(["orgs", "legacy_map"]);

const clean = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET.test(k))));

/** Everything the organisation owns, table by table (money stays in halalas, as stored). */
export async function exportOrg(db: Db, orgId: string) {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const children = new Set(CHILDREN.map(([c]) => c));
  for (const t of Object.values(schema) as unknown[]) {
    if (!t || typeof t !== "object" || !(Symbol.for("drizzle:IsDrizzleTable") in (t as object)))
      continue;
    const table = t as AnyTable;
    const name = getTableName(table);
    if (SKIP.has(name) || children.has(table)) continue;
    if (!("orgId" in getTableColumns(table))) continue;
    tables[name] = clean(await db.select().from(table).where(eq(table.orgId, orgId)));
  }
  for (const [child, column, parent] of CHILDREN)
    tables[getTableName(child)] = clean(
      await db
        .select()
        .from(child)
        .where(
          inArray(
            child[column],
            db.select({ id: parent.id }).from(parent).where(eq(parent.orgId, orgId)),
          ),
        ),
    );
  // Files are listed with a link, not copied in: the export stays small.
  tables.assets = (tables.assets ?? []).map((a) => ({ ...a, url: assetUrl(String(a.id)) }));
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  return {
    format: "buad-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    org: { id: orgId, name: org?.name ?? "" },
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
  };
}

/** «تنزيل نسخة كاملة»: for who may edit the organisation, and noted in the activity log. */
export const exportApp = new Hono<Env>()
  .use(requireAuth)
  .get("/", requirePerm("org.edit"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const data = await exportOrg(db, me.orgId);
    const rows = Object.values(data.counts).reduce((a, b) => a + b, 0);
    await audit(db, me, {
      entity: "org",
      action: "export",
      summary: "تنزيل نسخة كاملة من البيانات",
      detail: { tables: Object.keys(data.counts).length, rows },
    });
    const day = data.exportedAt.slice(0, 10);
    return c.body(JSON.stringify(data), 200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="buad-backup-${day}.json"`,
    });
  });
