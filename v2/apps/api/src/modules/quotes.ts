import { formatCode, type QuoteItem, quoteIsValid, quoteTotals } from "@buad/domain";
import { productRequests, quotes } from "@buad/schema/db";
import { quoteInput, quotePatch, quoteStatusInput } from "@buad/schema/quotes";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nextCounter, nowSec } from "./common";
import { loadVatRate } from "./finance";
import { loadOrgProfile } from "./org";

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

const shape = (r: Row) => {
  const items = itemsOf(r);
  const t = quoteTotals(items, r.discountHalalas, r.vatPct);
  return {
    id: r.id,
    number: r.number,
    requestId: r.requestId,
    clientId: r.clientId,
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
    return c.json({ ok: true, quotes: rows.map(shape) });
  })

  .post("/", zValidator("json", quoteInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    let { recipient, entity } = v;
    if (v.requestId) {
      const [req] = await db
        .select()
        .from(productRequests)
        .where(and(eq(productRequests.id, v.requestId), eq(productRequests.orgId, me.orgId)))
        .limit(1);
      if (!req) return c.json({ ok: false, error: "request_not_found" }, 404);
      recipient ||= req.name;
      entity ||= req.entity;
    }
    const year = new Date().getUTCFullYear();
    const number = formatCode("QT", await nextCounter(db, me.orgId, "quote", year), year);
    const id = newId("qte");
    await db.insert(quotes).values({
      id,
      orgId: me.orgId,
      number,
      requestId: v.requestId,
      clientId: v.clientId,
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

  .get("/vat-rate", async (c) =>
    c.json({ ok: true, rate: await loadVatRate(c.get("db"), c.get("user").orgId) }),
  )

  .get("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await own(db, me.orgId, c.req.param("id"));
    if (!r) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, quote: shape(r), org: await loadOrgProfile(db, me.orgId) });
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
          await db
            .update(productRequests)
            .set({ status: next as "quoted", updatedBy: me.id, updatedAt: nowSec() })
            .where(eq(productRequests.id, req.id));
      }
    }
    return c.json({ ok: true });
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
