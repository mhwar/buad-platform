import { productRequests, products } from "@buad/schema/db";
import { REQUEST_STATUSES, requestInput, requestPatch } from "@buad/schema/products";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import { newId, nowSec } from "./common";

/** «الطلبات»: quote requests from the website or logged by staff. Owner and managers only. */
type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type Row = typeof productRequests.$inferSelect;

const json = (s: string): Record<string, unknown> => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

export const shapeRequest = (r: Row) => ({
  id: r.id,
  productId: r.productId,
  productName: r.productName,
  source: r.source,
  status: r.status,
  name: r.name,
  entity: r.entity,
  phone: r.phone,
  email: r.email,
  message: r.message,
  answers: json(r.answers) as Record<string, string>,
  quote: json(r.quote),
  notes: r.notes,
  clientId: r.clientId,
  projectId: r.projectId,
  createdAt: r.createdAt,
});

export const requestsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner", "admin"))

  .get("/", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const status = c.req.query("status");
    const where =
      status && (REQUEST_STATUSES as readonly string[]).includes(status)
        ? and(eq(productRequests.orgId, orgId), eq(productRequests.status, status as Row["status"]))
        : eq(productRequests.orgId, orgId);
    const rows = await db
      .select()
      .from(productRequests)
      .where(where)
      .orderBy(desc(productRequests.createdAt))
      .limit(300);
    const counts = await db
      .select({ status: productRequests.status, n: sql<number>`count(*)` })
      .from(productRequests)
      .where(eq(productRequests.orgId, orgId))
      .groupBy(productRequests.status);
    return c.json({
      ok: true,
      requests: rows.map(shapeRequest),
      counts: Object.fromEntries(counts.map((x) => [x.status, Number(x.n)])),
    });
  })

  // Logged by hand, e.g. an enquiry that came in over WhatsApp.
  .post("/", zValidator("json", requestInput), async (c) => {
    const v = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    if (!v.phone && !v.email) return c.json({ ok: false, error: "contact_required" }, 400);
    const [prod] = v.productSlug
      ? await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.orgId, me.orgId), eq(products.slug, v.productSlug)))
          .limit(1)
      : [];
    const id = newId("req");
    await db.insert(productRequests).values({
      id,
      orgId: me.orgId,
      productId: prod?.id ?? "",
      productName: prod?.name ?? "",
      source: "manual",
      name: v.name,
      entity: v.entity,
      phone: v.phone,
      email: v.email,
      message: v.message,
      answers: JSON.stringify(v.answers),
      updatedBy: me.id,
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:id", zValidator("json", requestPatch), async (c) => {
    const v = c.req.valid("json");
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(productRequests)
      .set({ ...v, updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(productRequests.id, c.req.param("id")), eq(productRequests.orgId, me.orgId)))
      .returning({ id: productRequests.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  });
