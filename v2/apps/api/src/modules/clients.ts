import { formatCode, normalizeName } from "@buad/domain";
import { clientInput, clientPatch, listQuery } from "@buad/schema/clients";
import { clientContacts, clients, projects } from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import { requireAuth, requirePerm, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { contractTotalSql, likeTerm, logoUrlSql, newId, nextCounter, nowSec } from "./common";
import { loadFinance } from "./finance";
import { loadOrgProfile } from "./org";
import { visibleProjects } from "./projects";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type Input = z.output<typeof clientInput>;
const r2 = (n: number) => Math.round(n * 100) / 100;
type StatementLine = {
  id: string;
  number: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  hasFinance: boolean;
  contractNo: string;
  contractNet: number;
  vat: number;
  gross: number;
  spent: number;
  income: number;
  remaining: number;
  /** Money received from the client, and what the client still owes on the contract. */
  received: number;
  owed: number;
};

/** CR / VAT numbers must be unique in the org (archived clients included). */
async function findHardDuplicate(
  db: Db,
  orgId: string,
  v: { regNo?: string; taxNo?: string },
  selfId?: string,
) {
  const checks = [];
  if (v.regNo) checks.push(eq(clients.regNo, v.regNo));
  if (v.taxNo) checks.push(eq(clients.taxNo, v.taxNo));
  if (!checks.length) return null;
  const [row] = await db
    .select({
      id: clients.id,
      code: clients.code,
      name: clients.name,
      regNo: clients.regNo,
      taxNo: clients.taxNo,
      archivedAt: clients.archivedAt,
    })
    .from(clients)
    .where(
      and(eq(clients.orgId, orgId), or(...checks), selfId ? ne(clients.id, selfId) : undefined),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    field: v.regNo && row.regNo === v.regNo ? ("regNo" as const) : ("taxNo" as const),
  };
}

export async function findSimilarName(db: Db, orgId: string, nameNorm: string, selfId?: string) {
  const [row] = await db
    .select({ id: clients.id, code: clients.code, name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.orgId, orgId),
        eq(clients.nameNorm, nameNorm),
        selfId ? ne(clients.id, selfId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Signatory first (from the v1-style fields), then the other contacts. */
function contactRows(
  clientId: string,
  v: Pick<Input, "signatoryName" | "signatoryTitle" | "contacts">,
) {
  const rows = [];
  if (v.signatoryName || v.signatoryTitle) {
    rows.push({
      id: newId("con"),
      clientId,
      name: v.signatoryName,
      title: v.signatoryTitle,
      phone: "",
      email: "",
      isSignatory: true,
    });
  }
  for (const c of v.contacts) {
    if (!c.name && !c.phone && !c.email) continue;
    rows.push({ id: newId("con"), clientId, ...c, isSignatory: false });
  }
  return rows;
}

/** Inserts a client (after the caller has run its duplicate checks) with its contacts. */
export async function insertClient(db: Db, me: { id: string; orgId: string }, v: Input) {
  const nameNorm = normalizeName(v.name);
  const id = newId("cli");
  const code = formatCode("CL", await nextCounter(db, me.orgId, "client"));
  const t = nowSec();
  await db.insert(clients).values({
    id,
    orgId: me.orgId,
    code,
    name: v.name,
    nameNorm,
    type: v.type,
    email: v.email,
    phone: v.phone,
    city: v.city,
    regNo: v.regNo,
    taxNo: v.taxNo,
    address: v.address,
    website: v.website,
    notes: v.notes,
    logo: v.logo,
    createdBy: me.id,
    createdAt: t,
    updatedBy: me.id,
    updatedAt: t,
  });
  const contacts = contactRows(id, v);
  if (contacts.length) await db.insert(clientContacts).values(contacts);
  return { id, code };
}

async function loadClient(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export const clientsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("clients.view", "clients.edit"))

  .get("/", zValidator("query", listQuery), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const q = c.req.valid("query");
    const live = q.archived === "1" ? isNotNull(clients.archivedAt) : isNull(clients.archivedAt);
    const search = q.q
      ? or(
          sql`${clients.name} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
          sql`${clients.code} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
          sql`${clients.city} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
          sql`${clients.email} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
        )
      : undefined;
    const base = and(eq(clients.orgId, me.orgId), live, search);
    const typeFilter = q.type ? eq(clients.type, q.type as Input["type"]) : undefined;

    // Per-client project count and expected value, over the projects this user may see.
    const vis = visibleProjects(me);
    const projectCount = sql<number>`(SELECT count(*) FROM projects p WHERE p.client_id = "clients"."id" AND p.archived_at IS NULL AND ${vis.sqlFor("p")})`;
    const projectValue = sql<number>`(SELECT coalesce(sum(${contractTotalSql("p")}), 0) FROM projects p WHERE p.client_id = "clients"."id" AND p.archived_at IS NULL AND ${vis.sqlFor("p")})`;
    const liveVisible = sql`p.client_id = "clients"."id" AND p.archived_at IS NULL AND ${vis.sqlFor("p")}`;
    // Up to three most recently touched projects, for the card.
    const recentProjects = sql<string>`(SELECT coalesce(json_group_array(json_object('id', x.id, 'name', x.name)), '[]') FROM (SELECT p.id, p.name FROM projects p WHERE ${liveVisible} ORDER BY p.updated_at DESC LIMIT 3) x)`;
    const documentsCount = sql<number>`(SELECT count(*) FROM documents d JOIN projects p ON p.id = d.project_id WHERE ${liveVisible})`;
    const lastActivity = sql<
      number | null
    >`(SELECT max(p.updated_at) FROM projects p WHERE ${liveVisible})`;

    const order =
      q.sort === "name"
        ? [asc(clients.name)]
        : q.sort === "value"
          ? [desc(projectValue), asc(clients.name)]
          : [desc(clients.createdAt), desc(clients.code)];

    const items = await db
      .select({
        id: clients.id,
        code: clients.code,
        name: clients.name,
        type: clients.type,
        city: clients.city,
        email: clients.email,
        phone: clients.phone,
        logoUrl: sql<string>`${logoUrlSql("clients")}`,
        createdAt: clients.createdAt,
        archivedAt: clients.archivedAt,
        projectCount,
        projectValue,
        recentProjects,
        documentsCount,
        lastActivity,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .where(and(base, typeFilter))
      .orderBy(...order)
      .limit(1000);

    const byType = await db
      .select({ type: clients.type, n: count() })
      .from(clients)
      .where(base)
      .groupBy(clients.type);
    return c.json({
      ok: true,
      items: items.map((i) => ({
        ...i,
        projectCount: Number(i.projectCount),
        projectValue: Number(i.projectValue),
        recentProjects: JSON.parse(i.recentProjects || "[]") as { id: string; name: string }[],
        documentsCount: Number(i.documentsCount),
        lastActivity: Math.max(Number(i.lastActivity ?? 0), i.updatedAt ?? 0) || null,
      })),
      counts: Object.fromEntries(byType.map((r) => [r.type, r.n])) as Record<string, number>,
    });
  })

  .get("/check-duplicate", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const name = c.req.query("name") ?? "";
    const regNo = (c.req.query("regNo") ?? "").trim();
    const taxNo = (c.req.query("taxNo") ?? "").trim();
    const selfId = c.req.query("selfId") || undefined;
    const hard = await findHardDuplicate(db, me.orgId, { regNo, taxNo }, selfId);
    const norm = normalizeName(name);
    const similar = norm ? await findSimilarName(db, me.orgId, norm, selfId) : null;
    return c.json({ ok: true, duplicate: hard, similar });
  })

  .post("/", zValidator("json", clientInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const dup = await findHardDuplicate(db, me.orgId, v);
    if (dup) return c.json({ ok: false, error: "duplicate", duplicate: dup }, 409);
    const nameNorm = normalizeName(v.name);
    if (!v.confirmSimilarName) {
      const similar = await findSimilarName(db, me.orgId, nameNorm);
      if (similar) return c.json({ ok: false, error: "similar_name", similar }, 409);
    }
    const { id, code } = await insertClient(db, me, v);
    return c.json({ ok: true, id, code }, 201);
  })

  // The logo as an image. Lists reference this URL instead of carrying base64 data.
  .get("/:id/logo", async (c) => {
    const [row] = await c
      .get("db")
      .select({ logo: clients.logo })
      .from(clients)
      .where(and(eq(clients.id, c.req.param("id")), eq(clients.orgId, c.get("user").orgId)))
      .limit(1);
    const m = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(row?.logo ?? "");
    if (!m) return c.json({ ok: false, error: "not_found" }, 404);
    const bytes = Uint8Array.from(atob(m[2] ?? ""), (ch) => ch.charCodeAt(0));
    return c.body(bytes, 200, {
      "Content-Type": m[1] ?? "application/octet-stream",
      // Versioned URL (?v=updated_at): safe to cache for a long time.
      "Cache-Control": "private, max-age=31536000, immutable",
      // An SVG opened directly must not be able to run script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const client = await loadClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    const contacts = await db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, client.id))
      .orderBy(desc(clientContacts.isSignatory), asc(clientContacts.name));
    const vis = visibleProjects(me);
    const rows = await db
      .select({
        id: projects.id,
        number: projects.number,
        name: projects.name,
        type: projects.type,
        status: projects.status,
        startDate: projects.startDate,
        endDate: projects.endDate,
        expectedValue: projects.expectedValue,
        contractTotal: sql<number>`${contractTotalSql("projects")}`,
        archivedAt: projects.archivedAt,
      })
      .from(projects)
      .where(and(eq(projects.orgId, me.orgId), eq(projects.clientId, client.id), vis.where))
      .orderBy(desc(projects.createdAt));
    return c.json({ ok: true, client, contacts, projects: rows });
  })

  // Statement of account (amounts in riyals, to the halala): every visible project of the client with its contract and spending position.
  .get("/:id/statement", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const client = await loadClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.orgId, me.orgId),
          eq(projects.clientId, client.id),
          isNull(projects.archivedAt),
          visibleProjects(me).where,
        ),
      )
      .orderBy(asc(projects.createdAt));
    const items: StatementLine[] = [];
    for (const p of rows) {
      const fin = await loadFinance(db, p);
      const s = fin.summary;
      items.push({
        id: p.id,
        number: p.number,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        hasFinance: fin.ctrl.version > 0 || fin.entries.length > 0,
        contractNo: fin.ctrl.contractNo,
        contractNet: r2(s.contractNet),
        vat: r2(s.vatAmt),
        gross: r2(s.grossTotal),
        spent: r2(s.totalSpent),
        income: r2(s.totalIncome),
        remaining: r2(s.remainingFromGross),
        received: r2(fin.received),
        owed: r2(Math.max(0, s.grossTotal - fin.received)),
      });
    }
    const sum = (
      k: "contractNet" | "vat" | "gross" | "spent" | "income" | "remaining" | "received" | "owed",
    ) => r2(items.reduce((a, i) => a + i[k], 0));
    const org = await loadOrgProfile(db, me.orgId);
    return c.json({
      ok: true,
      client: {
        id: client.id,
        code: client.code,
        name: client.name,
        regNo: client.regNo,
        taxNo: client.taxNo,
        address: client.address,
        city: client.city,
        phone: client.phone,
        email: client.email,
      },
      org: { name: org.name, reg: org.reg, tax: org.tax, urls: org.urls },
      items,
      totals: {
        contractNet: sum("contractNet"),
        vat: sum("vat"),
        gross: sum("gross"),
        spent: sum("spent"),
        income: sum("income"),
        remaining: sum("remaining"),
        received: sum("received"),
        owed: sum("owed"),
      },
      generatedAt: nowSec(),
    });
  })

  .patch("/:id", zValidator("json", clientPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const current = await loadClient(db, me.orgId, c.req.param("id"));
    if (!current) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    // Only numbers that this request sets are checked; untouched ones were valid already.
    const dup = await findHardDuplicate(
      db,
      me.orgId,
      { regNo: v.regNo ?? "", taxNo: v.taxNo ?? "" },
      current.id,
    );
    if (dup) return c.json({ ok: false, error: "duplicate", duplicate: dup }, 409);
    const patch: Partial<typeof clients.$inferInsert> = { updatedBy: me.id, updatedAt: nowSec() };
    if (v.name !== undefined && v.name !== current.name) {
      const nameNorm = normalizeName(v.name);
      if (!v.confirmSimilarName) {
        const similar = await findSimilarName(db, me.orgId, nameNorm, current.id);
        if (similar) return c.json({ ok: false, error: "similar_name", similar }, 409);
      }
      patch.name = v.name;
      patch.nameNorm = nameNorm;
    }
    for (const k of [
      "type",
      "email",
      "phone",
      "city",
      "regNo",
      "taxNo",
      "address",
      "website",
      "notes",
      "logo",
    ] as const) {
      if (v[k] !== undefined) (patch as Record<string, unknown>)[k] = v[k];
    }
    await db.update(clients).set(patch).where(eq(clients.id, current.id));
    if (
      v.signatoryName !== undefined ||
      v.signatoryTitle !== undefined ||
      v.contacts !== undefined
    ) {
      const existing = await db
        .select()
        .from(clientContacts)
        .where(eq(clientContacts.clientId, current.id));
      const sig = existing.find((r) => r.isSignatory);
      const others = existing.filter((r) => !r.isSignatory);
      const rows = contactRows(current.id, {
        signatoryName: v.signatoryName ?? sig?.name ?? "",
        signatoryTitle: v.signatoryTitle ?? sig?.title ?? "",
        contacts:
          v.contacts ??
          others.map(({ name, title, phone, email }) => ({
            name,
            title,
            phone,
            email,
            isSignatory: false,
          })),
      });
      await db.delete(clientContacts).where(eq(clientContacts.clientId, current.id));
      if (rows.length) await db.insert(clientContacts).values(rows);
    }
    return c.json({ ok: true });
  })

  // Archiving a client archives its live projects with the SAME timestamp, so restore brings back exactly those.
  .post("/:id/archive", requirePerm("clients.archive"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const client = await loadClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    if (client.archivedAt) return c.json({ ok: true });
    const t = nowSec();
    await db
      .update(projects)
      .set({ archivedAt: t, archivedWith: client.id, updatedBy: me.id, updatedAt: t })
      .where(and(eq(projects.clientId, client.id), isNull(projects.archivedAt)));
    await db
      .update(clients)
      .set({ archivedAt: t, updatedBy: me.id, updatedAt: t })
      .where(eq(clients.id, client.id));
    return c.json({ ok: true });
  })

  .post("/:id/restore", requirePerm("clients.archive"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const client = await loadClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    if (!client.archivedAt) return c.json({ ok: true });
    const t = nowSec();
    await db
      .update(projects)
      .set({ archivedAt: null, archivedWith: "", updatedBy: me.id, updatedAt: t })
      .where(and(eq(projects.clientId, client.id), eq(projects.archivedWith, client.id)));
    await db
      .update(clients)
      .set({ archivedAt: null, updatedBy: me.id, updatedAt: t })
      .where(eq(clients.id, client.id));
    return c.json({ ok: true });
  })

  // Permanent delete: owner only, and only a client that never had projects.
  .delete("/:id", requirePerm("clients.delete"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const client = await loadClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    const [p] = await db
      .select({ n: count() })
      .from(projects)
      .where(eq(projects.clientId, client.id));
    if ((p?.n ?? 0) > 0) return c.json({ ok: false, error: "has_projects" }, 409);
    await db.delete(clientContacts).where(eq(clientContacts.clientId, client.id));
    await db.delete(clients).where(eq(clients.id, client.id));
    return c.json({ ok: true });
  });
