import {
  normalizeName,
  type PricingIn,
  priceQuote,
  type QuoteItem,
  quoteIsValid,
  quoteTotals,
  scheduleSplit,
} from "@buad/domain";
import { paymentSchedule, productRequests, products, quotes } from "@buad/schema/db";
import { quoteConvertInput, quoteInput, quotePatch, quoteStatusInput } from "@buad/schema/quotes";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { findSimilarName, insertClient } from "./clients";
import { atomic, newId, nowSec } from "./common";
import { loadVatRate } from "./finance";
import { moveStage } from "./opportunity";
import { loadOrgProfile } from "./org";
import { pricingOf } from "./products";
import { insertProject, liveClient } from "./projects";
import { resolveServiceLink } from "./service-link";
import { nextCode } from "./settings";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
type Row = typeof quotes.$inferSelect;

const itemsOf = (r: Row): QuoteItem[] => {
  try {
    return JSON.parse(r.items) as QuoteItem[];
  } catch {
    return [];
  }
};
const today = () => new Date().toISOString().slice(0, 10);

export const shapeQuote = (r: Row) => {
  const items = itemsOf(r);
  const t = quoteTotals(items, r.discountHalalas, r.vatPct);
  return {
    id: r.id,
    number: r.number,
    requestId: r.requestId,
    clientId: r.clientId,
    productId: r.productId,
    packageId: r.packageId,
    projectId: r.projectId,
    recipient: r.recipient,
    entity: r.entity,
    title: r.title,
    items: items.map((i) => ({
      label: i.label,
      qty: i.qty,
      unit: i.unitHalalas / 100,
      total: Math.round(i.qty * i.unitHalalas) / 100,
    })),
    discount: r.discountHalalas / 100,
    vatPct: r.vatPct,
    validUntil: r.validUntil,
    expired: r.status !== "accepted" && !quoteIsValid(r.validUntil, today()),
    terms: r.terms,
    status: r.status,
    version: r.version,
    totals: {
      subtotal: t.subtotal / 100,
      discount: t.discount / 100,
      net: t.net / 100,
      vat: t.vat / 100,
      total: t.total / 100,
    },
    totalHalalas: t.total,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

const toItems = (items: { label: string; qty: number; unit: number }[]) =>
  items.map((i) => ({ label: i.label, qty: i.qty, unitHalalas: Math.round(i.unit * 100) }));

async function own(db: Db, orgId: string, id: string) {
  const [r] = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.orgId, orgId)))
    .limit(1);
  return r ?? null;
}

export const quotesApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("sales.view", "sales.edit"))

  .get("/", async (c) => {
    const me = c.get("user");
    const status = c.req.query("status");
    const rows = await c
      .get("db")
      .select()
      .from(quotes)
      .where(
        status && ["draft", "sent", "accepted", "rejected"].includes(status)
          ? and(eq(quotes.orgId, me.orgId), eq(quotes.status, status as Row["status"]))
          : eq(quotes.orgId, me.orgId),
      )
      .orderBy(desc(quotes.createdAt))
      .limit(200);
    return c.json({ ok: true, quotes: rows.map(shapeQuote) });
  })

  .post("/", zValidator("json", quoteInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    let { recipient, entity, clientId } = v;
    if (v.requestId) {
      const [req] = await db
        .select()
        .from(productRequests)
        .where(and(eq(productRequests.id, v.requestId), eq(productRequests.orgId, me.orgId)))
        .limit(1);
      if (!req) return c.json({ ok: false, error: "request_not_found" }, 404);
      recipient ||= req.name;
      entity ||= req.entity;
      clientId ||= req.clientId; // an offer follows its opportunity's client
    }
    const number = await nextCode(db, me.orgId, "quote");
    const id = newId("qte");
    await db.insert(quotes).values({
      id,
      orgId: me.orgId,
      number,
      requestId: v.requestId,
      clientId,
      productId: v.productId,
      packageId: v.packageId,
      recipient,
      entity,
      title: v.title,
      items: JSON.stringify(toItems(v.items)),
      discountHalalas: Math.round(v.discount * 100),
      vatPct: v.vatPct,
      validUntil: v.validUntil,
      terms: v.terms,
      createdBy: me.id,
    });
    return c.json({ ok: true, id, number }, 201);
  })

  // Service packages at their selling price. Prices only: costs and margins never leave the pricing module.
  .get("/catalog", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const rate = await loadVatRate(db, me.orgId);
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.orgId, me.orgId), eq(products.status, "published")));
    const items: {
      productId: string;
      productName: string;
      packageId: string;
      packageName: string;
      price: number;
    }[] = [];
    for (const p of rows) {
      let names: Record<string, string> = {};
      try {
        names = Object.fromEntries(
          ((JSON.parse(p.content)?.packages ?? []) as { id: string; name: string }[]).map((k) => [
            k.id,
            k.name,
          ]),
        );
      } catch {
        names = {};
      }
      const pricing = pricingOf(p);
      for (const pkg of pricing.packages) {
        const q = priceQuote(pricing as PricingIn, pkg.qty, pkg.fixedPrice, rate);
        if (q.status === "ok" && names[pkg.packageId])
          items.push({
            productId: p.id,
            productName: p.name,
            packageId: pkg.packageId,
            packageName: names[pkg.packageId] as string,
            price: q.price,
          });
      }
    }
    return c.json({ ok: true, items });
  })

  .get("/vat-rate", async (c) =>
    c.json({ ok: true, rate: await loadVatRate(c.get("db"), c.get("user").orgId) }),
  )

  .get("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, quote: shapeQuote(r), org: await loadOrgProfile(db, me.orgId) });
  })

  .patch("/:id", zValidator("json", quotePatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    const { version, items, discount, ...rest } = c.req.valid("json");
    if (version !== r.version) return c.json({ ok: false, error: "version_conflict" }, 409);
    if (r.status === "accepted") return c.json({ ok: false, error: "accepted_locked" }, 409);
    await db
      .update(quotes)
      .set({
        ...rest,
        ...(items ? { items: JSON.stringify(toItems(items)) } : {}),
        ...(discount !== undefined ? { discountHalalas: Math.round(discount * 100) } : {}),
        version: r.version + 1,
        updatedAt: nowSec(),
      })
      .where(eq(quotes.id, r.id));
    return c.json({ ok: true, version: r.version + 1 });
  })

  // draft → sent → accepted | rejected; an accepted offer is final. Sending moves its request to «عُرض عليه سعر».
  .post("/:id/status", zValidator("json", quoteStatusInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    const { to } = c.req.valid("json");
    const allowed: Record<Row["status"], Row["status"][]> = {
      draft: ["sent"],
      sent: ["draft", "accepted", "rejected"],
      rejected: ["draft", "sent"],
      accepted: [],
    };
    if (!allowed[r.status].includes(to)) return c.json({ ok: false, error: "bad_transition" }, 409);
    if (to === "sent" && itemsOf(r).length === 0)
      return c.json({ ok: false, error: "no_items" }, 409);
    if (to === "accepted" && !quoteIsValid(r.validUntil, today()))
      return c.json({ ok: false, error: "expired" }, 409);
    await db
      .update(quotes)
      .set({ status: to, version: r.version + 1, updatedAt: nowSec() })
      .where(eq(quotes.id, r.id));
    if (r.requestId) {
      const next = to === "sent" ? "quoted" : to === "accepted" ? "negotiating" : null;
      if (next) {
        const [req] = await db
          .select()
          .from(productRequests)
          .where(eq(productRequests.id, r.requestId))
          .limit(1);
        // Only move a lead forward, never back (a won or lost request stays as it is).
        const order = ["new", "contacted", "quoted", "negotiating"];
        if (req && order.includes(req.status) && order.indexOf(req.status) < order.indexOf(next))
          await moveStage(db, me, req, next as "quoted");
        // Sending an offer starts the clock: follow up in five days unless a date is already set.
        if (to === "sent" && req && !req.followUpAt && order.includes(req.status))
          await db
            .update(productRequests)
            .set({ followUpAt: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) })
            .where(eq(productRequests.id, req.id));
      }
    }
    return c.json({ ok: true });
  })

  // A copy as a new draft with its own number: to revise an offer without touching the one already sent.
  .post("/:id/duplicate", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    const number = await nextCode(db, me.orgId, "quote");
    const id = newId("qte");
    await db.insert(quotes).values({
      id,
      orgId: me.orgId,
      number,
      requestId: r.requestId,
      clientId: r.clientId,
      productId: r.productId,
      packageId: r.packageId,
      recipient: r.recipient,
      entity: r.entity,
      title: r.title,
      items: r.items,
      discountHalalas: r.discountHalalas,
      vatPct: r.vatPct,
      validUntil: "",
      terms: r.terms,
      createdBy: me.id,
    });
    return c.json({ ok: true, id, number }, 201);
  })

  // An accepted offer becomes a client (new or existing) and a draft project at its price, with the
  // payment schedule the person picked, ready in «التحصيل». Once only.
  .post("/:id/convert", zValidator("json", quoteConvertInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    if (r.status !== "accepted") return c.json({ ok: false, error: "not_accepted" }, 409);
    if (r.projectId) return c.json({ ok: false, error: "already_converted" }, 409);

    const [req] = r.requestId
      ? await db
          .select()
          .from(productRequests)
          .where(and(eq(productRequests.id, r.requestId), eq(productRequests.orgId, me.orgId)))
          .limit(1)
      : [];
    let clientId = v.clientId ?? r.clientId ?? req?.clientId ?? "";
    if (clientId) {
      const cl = await liveClient(db, me.orgId, clientId);
      if (!cl) return c.json({ ok: false, error: "client_not_found" }, 404);
      if (cl.archivedAt) return c.json({ ok: false, error: "client_archived" }, 409);
    } else {
      const name = r.entity || r.recipient || req?.entity || req?.name || r.title;
      if (!v.confirmSimilarName) {
        const similar = await findSimilarName(db, me.orgId, normalizeName(name));
        if (similar) return c.json({ ok: false, error: "similar_name", similar }, 409);
      }
      clientId = (
        await insertClient(db, me, {
          name,
          type: "association",
          email: req?.email ?? "",
          phone: req?.phone ?? "",
          city: "",
          regNo: "",
          taxNo: "",
          address: "",
          website: "",
          notes: `أُنشئ من عرض السعر ${r.number}`,
          logo: "",
          signatoryName: "",
          signatoryTitle: "",
          contacts: r.recipient
            ? [{ name: r.recipient, title: "", phone: req?.phone ?? "", email: req?.email ?? "" }]
            : [],
          confirmSimilarName: true,
        } as Parameters<typeof insertClient>[2])
      ).id;
    }

    const t = quoteTotals(itemsOf(r), r.discountHalalas, r.vatPct);
    const link = r.productId
      ? await resolveServiceLink(db, me.orgId, r.productId, r.packageId)
      : null;
    const project = await insertProject(
      db,
      me,
      {
        clientId,
        name: v.projectName || r.title,
        type: "other",
        status: "draft",
        visibility: "team",
        location: "",
        startDate: "",
        endDate: "",
        payDate: "",
        // The contract value before VAT: the project adds its own VAT on top.
        expectedValue: t.net / 100,
        notes: `من عرض السعر ${r.number}`,
        productId: "",
        packageId: "",
      } as Parameters<typeof insertProject>[2],
      link && link.ok ? link : undefined,
    );
    const lines = scheduleSplit(v.schedule, t.total, today());
    // The instalments and the quote's link to its project land together.
    await atomic(db, [
      ...(lines.length
        ? [
            db.insert(paymentSchedule).values(
              lines.map((l) => ({
                id: newId("psc"),
                orgId: me.orgId,
                projectId: project.id,
                label: l.label,
                dueDate: l.dueDate,
                amount: l.amount,
                createdBy: me.id,
              })),
            ),
          ]
        : []),
      db
        .update(quotes)
        .set({ clientId, projectId: project.id, updatedAt: nowSec() })
        .where(eq(quotes.id, r.id)),
    ]);
    if (req) {
      req.clientId = clientId;
      await moveStage(db, me, req, "won", { clientId, projectId: project.id });
    }
    return c.json(
      {
        ok: true,
        clientId,
        projectId: project.id,
        number: project.number,
        instalments: lines.length,
      },
      201,
    );
  })

  .delete("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    if (r.status !== "draft") return c.json({ ok: false, error: "only_drafts" }, 409);
    await db.delete(quotes).where(eq(quotes.id, r.id));
    return c.json({ ok: true });
  });
