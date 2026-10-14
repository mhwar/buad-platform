import { normalizeName, type PricingIn, priceQuote } from "@buad/domain";
import { productRequests, products } from "@buad/schema/db";
import { REQUEST_STATUSES, requestInput, requestPatch } from "@buad/schema/products";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { findSimilarName, insertClient } from "./clients";
import { newId, nowSec } from "./common";
import { loadVatRate } from "./finance";
import { pricingOf } from "./products";
import { insertProject, liveClient } from "./projects";
import { resolveServiceLink } from "./service-link";

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
  ownerId: r.ownerId,
  followUpAt: r.followUpAt,
  value: r.valueHalalas / 100,
  lostReason: r.lostReason,
  updatedAt: r.updatedAt,
  createdAt: r.createdAt,
});

export const requestsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("sales.view", "sales.edit"))

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
    // Registrations of interest: requests made for a «coming soon» product.
    const ids = [...new Set(rows.map((r) => r.productId).filter(Boolean))];
    const soon = new Set<string>();
    if (ids.length) {
      const prods = await db
        .select({ id: products.id, content: products.content })
        .from(products)
        .where(and(eq(products.orgId, orgId), inArray(products.id, ids)));
      for (const p of prods) {
        try {
          if (JSON.parse(p.content)?.comingSoon === true) soon.add(p.id);
        } catch {
          // unreadable content: not coming-soon
        }
      }
    }
    return c.json({
      ok: true,
      requests: rows.map((r) => ({ ...shapeRequest(r), interest: soon.has(r.productId) })),
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
    const { value, ...v } = c.req.valid("json");
    const me = c.get("user");
    const upd = await c
      .get("db")
      .update(productRequests)
      .set({
        ...v,
        ...(value !== undefined ? { valueHalalas: Math.round(value * 100) } : {}),
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(and(eq(productRequests.id, c.req.param("id")), eq(productRequests.orgId, me.orgId)))
      .returning({ id: productRequests.id });
    return upd.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  });

const quoteInput = z.object({
  productId: z.string().min(1).max(60),
  packageId: z.string().min(1).max(40),
  times: z.coerce.number().min(0.01).max(1_000_000),
});
const convertInput = z.object({
  /** Link an existing client instead of creating one. */
  clientId: z.string().max(60).optional(),
  /** Seen the «similar name» warning and still want a new client. */
  confirmSimilarName: z.boolean().default(false),
  projectName: z.string().trim().max(200).optional(),
});

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The service and package a request was quoted on (falls back to its product, no package). */
async function serviceLinkOf(
  db: Db,
  orgId: string,
  requestProductId: string,
  quote: { productId?: string; packageId?: string },
) {
  const r = await resolveServiceLink(
    db,
    orgId,
    quote.productId || requestProductId,
    quote.packageId ?? "",
  );
  return r.ok ? r : { productId: "", packageId: "", packageName: "" };
}

requestsApp
  // Prices the request from the product's private pricing model: numbers are computed here,
  // never taken from the browser. The snapshot is kept with the request (managers only).
  .put("/:id/quote", zValidator("json", quoteInput), async (c) => {
    const v = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    const [row] = await db
      .select()
      .from(productRequests)
      .where(and(eq(productRequests.id, c.req.param("id")), eq(productRequests.orgId, me.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, v.productId), eq(products.orgId, me.orgId)))
      .limit(1);
    if (!prod) return c.json({ ok: false, error: "product_not_found" }, 404);
    const pricing = pricingOf(prod);
    const pkg = pricing.packages.find((p) => p.packageId === v.packageId);
    const pkgName = JSON.parse(prod.content)?.packages?.find(
      (p: { id: string }) => p.id === v.packageId,
    )?.name;
    if (!pkg || !pkgName) return c.json({ ok: false, error: "package_not_found" }, 404);
    const rate = await loadVatRate(db, me.orgId);
    const qty = Object.fromEntries(Object.entries(pkg.qty).map(([k, n]) => [k, n * v.times]));
    const q = priceQuote(pricing as PricingIn, qty, pkg.fixedPrice * v.times, rate);
    if (q.status !== "ok")
      return c.json(
        { ok: false, error: "quote_incomplete", reason: q.status, missing: q.missing },
        400,
      );
    const quote = {
      productId: prod.id,
      productName: prod.name,
      packageId: v.packageId,
      packageName: pkgName as string,
      times: v.times,
      vatRate: rate,
      lines: q.lines,
      cost: q.cost,
      price: q.price,
      vat: q.vat,
      total: q.total,
      profit: q.profit,
      marginPct: q.marginPct,
      at: nowSec(),
    };
    await db
      .update(productRequests)
      .set({
        quote: JSON.stringify(quote),
        status: row.status === "new" || row.status === "contacted" ? "quoted" : row.status,
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(eq(productRequests.id, row.id));
    return c.json({ ok: true, quote });
  })

  // Request → client (new, or an existing one) + a draft project carrying the quoted price.
  .post("/:id/convert", zValidator("json", convertInput), async (c) => {
    const v = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    const [row] = await db
      .select()
      .from(productRequests)
      .where(and(eq(productRequests.id, c.req.param("id")), eq(productRequests.orgId, me.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    if (row.projectId) return c.json({ ok: false, error: "already_converted" }, 409);

    let clientId = v.clientId ?? "";
    if (clientId) {
      const client = await liveClient(db, me.orgId, clientId);
      if (!client) return c.json({ ok: false, error: "client_not_found" }, 404);
      if (client.archivedAt) return c.json({ ok: false, error: "client_archived" }, 409);
    } else {
      const clientName = row.entity || row.name;
      if (!v.confirmSimilarName) {
        const similar = await findSimilarName(db, me.orgId, normalizeName(clientName));
        if (similar) return c.json({ ok: false, error: "similar_name", similar }, 409);
      }
      clientId = (
        await insertClient(db, me, {
          name: clientName,
          type: "association",
          email: row.email,
          phone: row.phone,
          city: "",
          regNo: "",
          taxNo: "",
          address: "",
          website: "",
          notes: "أُنشئ من طلب عرض سعر",
          logo: "",
          signatoryName: "",
          signatoryTitle: "",
          contacts: [{ name: row.name, title: "", phone: row.phone, email: row.email }],
          confirmSimilarName: true,
        } as Parameters<typeof insertClient>[2])
      ).id;
    }

    const quote = JSON.parse(row.quote) as {
      price?: number;
      productId?: string;
      packageId?: string;
      packageName?: string;
      times?: number;
    };
    const answers = Object.entries(JSON.parse(row.answers) as Record<string, string>)
      .map(([k, a]) => `${k}: ${a}`)
      .join("\n");
    const project = await insertProject(
      db,
      me,
      {
        clientId,
        name: v.projectName || `${row.productName || "طلب"} — ${row.entity || row.name}`,
        type: "other",
        status: "draft",
        visibility: "team",
        location: "",
        startDate: "",
        endDate: "",
        payDate: "",
        expectedValue: r2(quote.price ?? 0),
        notes: [
          quote.packageName ? `الباقة: ${quote.packageName} × ${quote.times}` : "",
          answers,
          row.message,
        ]
          .filter(Boolean)
          .join("\n"),
        productId: "",
        packageId: "",
      } as Parameters<typeof insertProject>[2],
      await serviceLinkOf(db, me.orgId, row.productId, quote),
    );
    await db
      .update(productRequests)
      .set({
        clientId,
        projectId: project.id,
        status: "won",
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(eq(productRequests.id, row.id));
    return c.json({ ok: true, clientId, projectId: project.id, number: project.number }, 201);
  });
