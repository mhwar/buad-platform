import {
  type PricingIn,
  plannedMargin,
  productReadiness,
  productStats,
  type StatProject,
} from "@buad/domain";
import { BLUEPRINTS, blueprintByKey } from "@buad/schema/blueprints";
import { clients, productRequests, products, projects } from "@buad/schema/db";
import {
  type PricingModel,
  type ProductContent,
  pricingModel,
  productContent,
  productCreate,
  productPatch,
} from "@buad/schema/products";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull, ne, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { loadFinance, loadVatRate } from "./finance";

/* ─────────────────────────────────────────────────────────────────────────────
 * «المنتجات والخدمات» (owner and managers only). A product is public-safe `content` plus a
 * private `pricing` model; blueprints are turned into products only when the owner asks.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type Row = typeof products.$inferSelect;

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

export const contentOf = (row: Row): ProductContent => productContent.parse(safeJson(row.content));
export const pricingOf = (row: Row): PricingModel => pricingModel.parse(safeJson(row.pricing));

export function shapeProduct(row: Row, vatRate: number) {
  const content = contentOf(row);
  const pricing = pricingOf(row);
  const readiness = productReadiness(content, pricing as PricingIn, vatRate);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    status: row.status,
    showOnSite: row.showOnSite,
    version: row.version,
    updatedAt: row.updatedAt,
    content,
    pricing,
    vatRate,
    readiness,
  };
}

type StatRow = {
  productId: string;
  stat: StatProject;
  row: {
    id: string;
    number: string;
    name: string;
    clientId: string;
    clientName: string;
    status: string;
    packageId: string;
    packageName: string;
    startDate: string;
    hasFinance: boolean;
    contractNet: number;
    gross: number;
    received: number;
    expenses: number;
    profit: number;
  };
};

/** Live projects matching `where`, each with its own finance numbers (finCalc). */
async function statRows(db: Db, orgId: string, where: SQL | undefined): Promise<StatRow[]> {
  const rows = await db
    .select({ p: projects, clientName: clients.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.orgId, orgId), isNull(projects.archivedAt), where))
    .orderBy(asc(projects.number));
  const out: StatRow[] = [];
  for (const { p, clientName } of rows) {
    const fin = await loadFinance(db, p);
    const m = {
      contractNet: fin.summary.contractNet,
      gross: fin.summary.grossTotal,
      received: fin.received,
      expenses: fin.summary.totalExpenses,
      profit: fin.summary.profit,
    };
    out.push({
      productId: p.productId,
      stat: {
        id: p.id,
        clientId: p.clientId,
        clientName,
        status: p.status,
        packageId: p.packageId,
        startDate: p.startDate,
        ...m,
      },
      row: {
        id: p.id,
        number: p.number,
        name: p.name,
        clientId: p.clientId,
        clientName,
        status: p.status,
        packageId: p.packageId,
        packageName: p.packageName,
        startDate: p.startDate,
        hasFinance: fin.ctrl.version > 0 || fin.entries.length > 0,
        ...m,
      },
    });
  }
  return out;
}

const plannedOf = (row: Row) => {
  const pr = pricingOf(row);
  return plannedMargin(pr.method, pr.value);
};

async function slugFor(db: Db, orgId: string, wanted: string): Promise<string> {
  const base = wanted || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${base}-${i + 1}` : base;
    const [hit] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.slug, candidate)))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** URL-safe slug from the name when it has Latin letters, else a generic one. */
const autoSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "product";

export const productsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner", "admin"))

  .get("/", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const rate = await loadVatRate(db, orgId);
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.orgId, orgId))
      .orderBy(asc(products.sortOrder), asc(products.createdAt));
    return c.json({
      ok: true,
      products: rows.map((r) => {
        const p = shapeProduct(r, rate);
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          tagline: p.tagline,
          status: p.status,
          showOnSite: p.showOnSite,
          version: p.version,
          updatedAt: p.updatedAt,
          packages: p.content.packages.length,
          readyCount: p.readiness.filter((x) => x.ok).length,
          readyTotal: p.readiness.length,
        };
      }),
    });
  })

  .get("/blueprints", async (c) => {
    const rows = await c
      .get("db")
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(eq(products.orgId, c.get("user").orgId));
    return c.json({
      ok: true,
      blueprints: BLUEPRINTS.map((b) => ({
        key: b.key,
        name: b.name,
        tagline: b.tagline,
        productId: rows.find((r) => r.slug === b.slug)?.id ?? null,
      })),
    });
  })

  // What the service has done across the org's projects: counts, entities, packages, money.
  .get("/overview", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const prods = await db
      .select()
      .from(products)
      .where(eq(products.orgId, orgId))
      .orderBy(asc(products.sortOrder), asc(products.createdAt));
    const linked = await statRows(db, orgId, ne(projects.productId, ""));
    const unlinked = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.orgId, orgId), isNull(projects.archivedAt), eq(projects.productId, "")),
      );
    const reqs = await db.select().from(productRequests).where(eq(productRequests.orgId, orgId));
    const now = nowSec();
    return c.json({
      ok: true,
      unlinkedProjects: unlinked.length,
      products: prods.map((p) => {
        const mine = linked.filter((r) => r.productId === p.id);
        const s = productStats({
          projects: mine.map((r) => r.stat),
          requests: reqs.filter((r) => r.productId === p.id),
          plannedMarginPct: plannedOf(p),
          packageNames: {},
          now,
        });
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          projects: s.totals.projects,
          entities: s.totals.entities,
          repeatEntities: s.totals.repeatEntities,
          contractNet: s.totals.contractNet,
          profit: s.totals.profit,
          marginPct: s.totals.marginPct,
          plannedMarginPct: s.plannedMarginPct,
          marginGap: s.marginGap,
          requests: s.funnel.total,
          won: s.funnel.won,
          conversionPct: s.funnel.conversionPct,
        };
      }),
    });
  })

  // Live projects that are not linked to any service yet (linking is the owner's choice).
  .get("/unlinked-projects", async (c) => {
    const rows = await statRows(c.get("db"), c.get("user").orgId, eq(projects.productId, ""));
    return c.json({
      ok: true,
      projects: rows.map((r) => ({
        id: r.row.id,
        number: r.row.number,
        name: r.row.name,
        clientName: r.row.clientName,
        status: r.row.status,
        contractNet: r.row.contractNet,
      })),
    });
  })

  // Idempotent: asking again for the same blueprint returns the product it already made.
  .post("/from-blueprint/:key", async (c) => {
    const bp = blueprintByKey(c.req.param("key"));
    if (!bp) return c.json({ ok: false, error: "not_found" }, 404);
    const db = c.get("db");
    const me = c.get("user");
    const [have] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, me.orgId), eq(products.slug, bp.slug)))
      .limit(1);
    if (have) return c.json({ ok: true, id: have.id, created: false });
    const id = newId("prd");
    const t = nowSec();
    await db.insert(products).values({
      id,
      orgId: me.orgId,
      slug: bp.slug,
      name: bp.name,
      tagline: bp.tagline,
      content: JSON.stringify(bp.content),
      pricing: JSON.stringify(bp.pricing),
      createdBy: me.id,
      updatedBy: me.id,
      createdAt: t,
      updatedAt: t,
    });
    return c.json({ ok: true, id, created: true }, 201);
  })

  .post("/", zValidator("json", productCreate), async (c) => {
    const v = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    const id = newId("prd");
    const t = nowSec();
    const slug = await slugFor(db, me.orgId, v.slug ?? autoSlug(v.name));
    await db.insert(products).values({
      id,
      orgId: me.orgId,
      slug,
      name: v.name,
      tagline: v.tagline ?? "",
      content: JSON.stringify(productContent.parse({})),
      pricing: JSON.stringify(pricingModel.parse({})),
      createdBy: me.id,
      updatedBy: me.id,
      createdAt: t,
      updatedAt: t,
    });
    return c.json({ ok: true, id }, 201);
  })

  .get("/:id/stats", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, c.req.param("id")), eq(products.orgId, orgId)))
      .limit(1);
    if (!prod) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await statRows(db, orgId, eq(projects.productId, prod.id));
    const reqs = await db
      .select()
      .from(productRequests)
      .where(and(eq(productRequests.orgId, orgId), eq(productRequests.productId, prod.id)));
    const content = contentOf(prod);
    const stats = productStats({
      projects: rows.map((r) => r.stat),
      requests: reqs.map((r) => ({ status: r.status, createdAt: r.createdAt })),
      plannedMarginPct: plannedOf(prod),
      packageNames: Object.fromEntries(content.packages.map((p) => [p.id, p.name])),
      now: nowSec(),
    });
    return c.json({
      ok: true,
      product: { id: prod.id, name: prod.name, slug: prod.slug },
      stats,
      projects: rows.map((r) => r.row),
    });
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, c.req.param("id")), eq(products.orgId, orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, product: shapeProduct(row, await loadVatRate(db, orgId)) });
  })

  .patch("/:id", zValidator("json", productPatch), async (c) => {
    const v = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, c.req.param("id")), eq(products.orgId, me.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    if (v.version !== row.version)
      return c.json({ ok: false, error: "stale", version: row.version }, 409);
    if (v.slug && v.slug !== row.slug) {
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, me.orgId), eq(products.slug, v.slug)))
        .limit(1);
      if (dup) return c.json({ ok: false, error: "duplicate_slug" }, 409);
    }
    const { version: _v, content, pricing, ...rest } = v;
    const upd = await db
      .update(products)
      .set({
        ...rest,
        ...(content ? { content: JSON.stringify(content) } : {}),
        ...(pricing ? { pricing: JSON.stringify(pricing) } : {}),
        version: row.version + 1,
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(
        and(
          eq(products.id, row.id),
          eq(products.orgId, me.orgId),
          eq(products.version, row.version),
        ),
      )
      .returning({ version: products.version });
    // Lost a race with another save between the read and the write.
    if (!upd.length) return c.json({ ok: false, error: "stale", version: row.version }, 409);
    return c.json({ ok: true, version: upd[0]?.version });
  });

/** Used by the public site: only published, listed products. */
export async function listedProducts(db: Db, orgId: string) {
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.status, "published"),
        eq(products.showOnSite, true),
      ),
    )
    .orderBy(asc(products.sortOrder), asc(products.createdAt));
}
