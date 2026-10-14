import { formatCode, fromRiyals } from "@buad/domain";
import { listQuery, projectInput, projectPatch } from "@buad/schema/clients";
import { clients, legacyMap, products, projectFinance, projects } from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import { requireAuth, requirePerm, requireRW, type Vars } from "../auth/middleware";
import type { AuthUser, Db } from "../auth/service";
import { contractTotalSql, likeTerm, logoUrlSql, newId, nextCounter, nowSec } from "./common";
import { resolveServiceLink } from "./service-link";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

/**
 * Which projects a person sees, by the scope of their role:
 * «all» everything; «team» (v1's rule) their own, team-visible and ownerless projects;
 * «mine» only their own. Being added to a project's members always shows it.
 */
export function visibleProjects(me: Pick<AuthUser, "id" | "scopes">): {
  where: SQL | undefined;
  sqlFor: (alias: string) => SQL;
} {
  const scope = me.scopes.projects ?? "team";
  if (scope === "all") return { where: undefined, sqlFor: () => sql`1 = 1` };
  const member = (id: SQL) =>
    sql`EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${id} AND pm.user_id = ${me.id})`;
  if (scope === "mine")
    return {
      where: or(eq(projects.ownerId, me.id), member(sql`${projects.id}`)),
      sqlFor: (a) => sql`(${sql.raw(a)}.owner_id = ${me.id} OR ${member(sql.raw(`${a}.id`))})`,
    };
  return {
    where: or(
      eq(projects.ownerId, me.id),
      eq(projects.visibility, "team"),
      eq(projects.ownerId, ""),
      member(sql`${projects.id}`),
    ),
    sqlFor: (a) =>
      sql`(${sql.raw(a)}.owner_id = ${me.id} OR ${sql.raw(a)}.visibility = 'team' OR ${sql.raw(a)}.owner_id = '' OR ${member(sql.raw(`${a}.id`))})`,
  };
}

export async function loadVisible(db: Db, me: AuthUser, id: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.orgId, me.orgId), visibleProjects(me).where))
    .limit(1);
  return row ?? null;
}

export async function liveClient(db: Db, orgId: string, clientId: string) {
  const [row] = await db
    .select({ id: clients.id, archivedAt: clients.archivedAt })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** Inserts a project for a client the caller has already checked. */
export async function insertProject(
  db: Db,
  me: { id: string; orgId: string },
  v: z.output<typeof projectInput>,
  link: { productId: string; packageId: string; packageName: string } = {
    productId: "",
    packageId: "",
    packageName: "",
  },
) {
  const year = new Date().getUTCFullYear();
  const number = formatCode("PRJ", await nextCounter(db, me.orgId, "project", year), year);
  const id = newId("prj");
  const t = nowSec();
  await db.insert(projects).values({
    id,
    orgId: me.orgId,
    clientId: v.clientId,
    number,
    name: v.name,
    type: v.type,
    status: v.status,
    ownerId: me.id,
    visibility: v.visibility,
    location: v.location,
    startDate: v.startDate,
    endDate: v.endDate,
    payDate: v.payDate,
    expectedValue: fromRiyals(v.expectedValue),
    notes: v.notes,
    productId: link.productId,
    packageId: link.packageId,
    packageName: link.packageName,
    createdBy: me.id,
    createdAt: t,
    updatedBy: me.id,
    updatedAt: t,
  });
  return { id, number };
}

export const projectsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("projects.view", "projects.edit"))

  .get("/", zValidator("query", listQuery), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const q = c.req.valid("query");
    const live = q.archived === "1" ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt);
    const search = q.q
      ? or(
          sql`${projects.name} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
          sql`${projects.number} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
          sql`${clients.name} LIKE ${likeTerm(q.q)} ESCAPE '\\'`,
        )
      : undefined;
    const base = and(
      eq(projects.orgId, me.orgId),
      live,
      visibleProjects(me).where,
      q.clientId ? eq(projects.clientId, q.clientId) : undefined,
      q.product ? eq(projects.productId, q.product === "none" ? "" : q.product) : undefined,
      q.type ? eq(projects.type, q.type as never) : undefined,
      search,
    );
    const contractTotal = sql<number>`${contractTotalSql("projects")}`;
    const order =
      q.sort === "name"
        ? [asc(projects.name)]
        : q.sort === "value"
          ? [desc(contractTotal), asc(projects.name)]
          : [desc(projects.createdAt), desc(projects.number)];
    const items = await db
      .select({
        id: projects.id,
        number: projects.number,
        name: projects.name,
        type: projects.type,
        status: projects.status,
        visibility: projects.visibility,
        location: projects.location,
        startDate: projects.startDate,
        endDate: projects.endDate,
        expectedValue: projects.expectedValue,
        /** Contract total incl. VAT (halalas): finance settings if present, else expected value + 15%. */
        contractTotal,
        archivedAt: projects.archivedAt,
        clientId: projects.clientId,
        clientName: clients.name,
        clientLogoUrl: sql<string>`${logoUrlSql("clients")}`,
        clientCode: clients.code,
        productId: projects.productId,
        packageId: projects.packageId,
        packageName: projects.packageName,
        productName: sql<string>`COALESCE(${products.name}, '')`,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(products, eq(products.id, projects.productId))
      .where(and(base, q.status ? eq(projects.status, q.status as never) : undefined))
      .orderBy(...order)
      .limit(1000);
    const byStatus = await db
      .select({ status: projects.status, n: count() })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(base)
      .groupBy(projects.status);
    return c.json({
      ok: true,
      items,
      counts: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Record<string, number>,
    });
  })

  .post("/", zValidator("json", projectInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const client = await liveClient(db, me.orgId, v.clientId);
    if (!client) return c.json({ ok: false, error: "client_not_found" }, 404);
    if (client.archivedAt) return c.json({ ok: false, error: "client_archived" }, 409);
    const link = await resolveServiceLink(db, me.orgId, v.productId, v.packageId);
    if (!link.ok)
      return c.json(
        { ok: false, error: link.error },
        link.error === "package_without_product" ? 400 : 404,
      );
    const { id, number } = await insertProject(db, me, v, link);
    return c.json({ ok: true, id, number }, 201);
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = await loadVisible(db, me, c.req.param("id"));
    if (!project) return c.json({ ok: false, error: "not_found" }, 404);
    const [client] = await db
      .select({
        id: clients.id,
        code: clients.code,
        name: clients.name,
        type: clients.type,
        archivedAt: clients.archivedAt,
        logoUrl: sql<string>`${logoUrlSql("clients")}`,
      })
      .from(clients)
      .where(eq(clients.id, project.clientId))
      .limit(1);
    const [fin] = await db
      .select({ v: projectFinance.version })
      .from(projectFinance)
      .where(eq(projectFinance.projectId, project.id))
      .limit(1);
    const [imported] = await db
      .select({ id: legacyMap.newId })
      .from(legacyMap)
      .where(and(eq(legacyMap.kind, "finance"), eq(legacyMap.legacyId, project.id)))
      .limit(1);
    const [svc] = project.productId
      ? await db
          .select({ name: products.name })
          .from(products)
          .where(and(eq(products.id, project.productId), eq(products.orgId, me.orgId)))
          .limit(1)
      : [];
    return c.json({
      ok: true,
      project,
      service: project.productId
        ? {
            productId: project.productId,
            productName: svc?.name ?? "",
            packageId: project.packageId,
            packageName: project.packageName,
          }
        : null,
      client: client ?? null,
      financeExists: !!fin,
      financeImported: !!imported,
    });
  })

  .patch("/:id", zValidator("json", projectPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const current = await loadVisible(db, me, c.req.param("id"));
    if (!current) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    if (
      v.visibility !== undefined &&
      v.visibility !== current.visibility &&
      current.ownerId !== me.id &&
      me.scopes.projects !== "all"
    ) {
      return c.json({ ok: false, error: "forbidden" }, 403);
    }
    if (v.clientId !== undefined && v.clientId !== current.clientId) {
      const client = await liveClient(db, me.orgId, v.clientId);
      if (!client) return c.json({ ok: false, error: "client_not_found" }, 404);
      if (client.archivedAt) return c.json({ ok: false, error: "client_archived" }, 409);
    }
    const start = v.startDate ?? current.startDate;
    const end = v.endDate ?? current.endDate;
    if (start && end && end < start) return c.json({ ok: false, error: "end_before_start" }, 400);
    const { expectedValue, productId, packageId, ...rest } = v;
    // Changing the service without naming a package clears the old package.
    let link: { productId: string; packageId: string; packageName: string } | undefined;
    if (productId !== undefined || packageId !== undefined) {
      const nextProduct = productId ?? current.productId;
      const nextPackage =
        packageId ??
        (productId !== undefined && productId !== current.productId ? "" : current.packageId);
      const r = await resolveServiceLink(db, me.orgId, nextProduct, nextPackage);
      if (!r.ok)
        return c.json(
          { ok: false, error: r.error },
          r.error === "package_without_product" ? 400 : 404,
        );
      link = r;
    }
    await db
      .update(projects)
      .set({
        ...rest,
        ...(link
          ? { productId: link.productId, packageId: link.packageId, packageName: link.packageName }
          : {}),
        ...(expectedValue !== undefined ? { expectedValue: fromRiyals(expectedValue) } : {}),
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(eq(projects.id, current.id));
    return c.json({ ok: true });
  })

  .post("/:id/archive", requirePerm("projects.archive"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const p = await loadVisible(db, me, c.req.param("id"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    if (!p.archivedAt) {
      const t = nowSec();
      await db
        .update(projects)
        .set({ archivedAt: t, archivedWith: "", updatedBy: me.id, updatedAt: t })
        .where(eq(projects.id, p.id));
    }
    return c.json({ ok: true });
  })

  .post("/:id/restore", requirePerm("projects.archive"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const p = await loadVisible(db, me, c.req.param("id"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const client = await liveClient(db, me.orgId, p.clientId);
    if (client?.archivedAt) return c.json({ ok: false, error: "client_archived" }, 409);
    await db
      .update(projects)
      .set({ archivedAt: null, archivedWith: "", updatedBy: me.id, updatedAt: nowSec() })
      .where(eq(projects.id, p.id));
    return c.json({ ok: true });
  })

  .delete("/:id", requirePerm("projects.delete"), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const p = await loadVisible(db, me, c.req.param("id"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    await db.delete(projects).where(eq(projects.id, p.id));
    return c.json({ ok: true });
  });
