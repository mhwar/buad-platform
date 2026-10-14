import {
  assets,
  productRequests,
  products,
  sitePublishes,
  siteSettings,
  users,
} from "@buad/schema/db";
import {
  DEFAULT_SITE,
  type SiteContent,
  siteAssetIds,
  siteContent,
  sitePatch,
} from "@buad/schema/site";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { siteHomePayload } from "./site-public";

/* ─────────────────────────────────────────────────────────────────────────────
 * «الموقع»: the owner edits a draft and publishes it; visitors only see the last published
 * snapshot (modules/site-public.ts). Owner and managers only.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

const parseSite = (s: string): SiteContent => {
  try {
    return siteContent.parse(JSON.parse(s));
  } catch {
    return DEFAULT_SITE;
  }
};

/** The draft (the default site until first saved) and what is published. */
export async function loadSite(db: Db, orgId: string) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.orgId, orgId)).limit(1);
  const draft = row ? parseSite(row.draft) : DEFAULT_SITE;
  const published = row?.published ? parseSite(row.published) : null;
  return {
    draft,
    published,
    version: row?.version ?? 1,
    publishedAt: row?.publishedAt ?? 0,
    publishedBy: row?.publishedBy ?? "",
    saved: !!row,
  };
}

export const siteApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("site.view", "site.edit"))

  .get("/draft", async (c) => {
    const s = await loadSite(c.get("db"), c.get("user").orgId);
    return c.json({
      ok: true,
      content: s.draft,
      version: s.version,
      isPublished: !!s.published,
      publishedAt: s.publishedAt,
      // Edited since the last publish (or never published).
      changed: !s.published || JSON.stringify(s.published) !== JSON.stringify(s.draft),
    });
  })

  // The home page as the draft would look (for managers, before publishing).
  .get("/preview", async (c) => {
    const s = await loadSite(c.get("db"), c.get("user").orgId);
    return c.json(await siteHomePayload(c.get("db"), s.draft));
  })

  .patch("/draft", zValidator("json", sitePatch), async (c) => {
    const { version, content } = c.req.valid("json");
    const db = c.get("db");
    const me = c.get("user");
    // Every image the site uses must be one of this organisation's own assets.
    const ids = [...new Set(siteAssetIds(content))];
    if (ids.length) {
      const own = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.orgId, me.orgId), inArray(assets.id, ids)));
      if (own.length !== ids.length) return c.json({ ok: false, error: "invalid_asset" }, 400);
    }
    const cur = await loadSite(db, me.orgId);
    if (version !== cur.version)
      return c.json({ ok: false, error: "stale", version: cur.version }, 409);
    const body = JSON.stringify(content);
    if (!cur.saved) {
      await db
        .insert(siteSettings)
        .values({ orgId: me.orgId, draft: body, version: 2, updatedBy: me.id, updatedAt: nowSec() })
        .onConflictDoNothing();
      return c.json({ ok: true, version: 2 });
    }
    const upd = await db
      .update(siteSettings)
      .set({ draft: body, version: cur.version + 1, updatedBy: me.id, updatedAt: nowSec() })
      .where(and(eq(siteSettings.orgId, me.orgId), eq(siteSettings.version, cur.version)))
      .returning({ version: siteSettings.version });
    if (!upd.length) return c.json({ ok: false, error: "stale", version: cur.version }, 409);
    return c.json({ ok: true, version: upd[0]?.version });
  })

  // Snapshot the draft: from now on visitors see exactly this.
  .post("/publish", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const cur = await loadSite(db, me.orgId);
    const body = JSON.stringify(cur.draft);
    const t = nowSec();
    await db
      .insert(siteSettings)
      .values({
        orgId: me.orgId,
        draft: body,
        published: body,
        publishedAt: t,
        publishedBy: me.id,
        version: cur.saved ? cur.version : 2,
        updatedBy: me.id,
        updatedAt: t,
      })
      .onConflictDoUpdate({
        target: siteSettings.orgId,
        set: { published: body, publishedAt: t, publishedBy: me.id },
      });
    // Keep the last 20 publishes so an earlier version can be restored.
    await db.insert(sitePublishes).values({
      id: newId("pub"),
      orgId: me.orgId,
      content: body,
      publishedAt: t,
      publishedBy: me.id,
    });
    const keep = await db
      .select({ id: sitePublishes.id })
      .from(sitePublishes)
      .where(eq(sitePublishes.orgId, me.orgId))
      .orderBy(desc(sitePublishes.publishedAt), desc(sql.raw("site_publishes.rowid")))
      .limit(20);
    await db.delete(sitePublishes).where(
      and(
        eq(sitePublishes.orgId, me.orgId),
        notInArray(
          sitePublishes.id,
          keep.map((k) => k.id),
        ),
      ),
    );
    return c.json({ ok: true, publishedAt: t });
  })

  // Earlier publishes (newest first); the one currently live is flagged.
  .get("/history", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const cur = await loadSite(db, orgId);
    const rows = await db
      .select({
        id: sitePublishes.id,
        publishedAt: sitePublishes.publishedAt,
        content: sitePublishes.content,
        byName: users.name,
        byEmail: users.email,
      })
      .from(sitePublishes)
      .leftJoin(users, eq(users.id, sitePublishes.publishedBy))
      .where(eq(sitePublishes.orgId, orgId))
      .orderBy(desc(sitePublishes.publishedAt), desc(sql.raw("site_publishes.rowid")))
      .limit(20);
    const live = cur.published ? JSON.stringify(cur.published) : "";
    return c.json({
      ok: true,
      history: rows.map((r) => ({
        id: r.id,
        publishedAt: r.publishedAt,
        by: r.byName || r.byEmail || "",
        live: r.content === live,
      })),
    });
  })

  // Puts an earlier publish back as the DRAFT (nothing changes for visitors until published).
  .post("/history/:id/restore", async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const [row] = await db
      .select()
      .from(sitePublishes)
      .where(and(eq(sitePublishes.id, c.req.param("id")), eq(sitePublishes.orgId, me.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    const content = siteContent.parse(JSON.parse(row.content));
    const cur = await loadSite(db, me.orgId);
    await db
      .insert(siteSettings)
      .values({
        orgId: me.orgId,
        draft: JSON.stringify(content),
        version: cur.saved ? cur.version + 1 : 2,
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .onConflictDoUpdate({
        target: siteSettings.orgId,
        set: {
          draft: JSON.stringify(content),
          version: cur.version + 1,
          updatedBy: me.id,
          updatedAt: nowSec(),
        },
      });
    return c.json({ ok: true });
  })

  // What the overview tab needs: requests, listed products, and what changed since publish.
  .get("/overview", async (c) => {
    const db = c.get("db");
    const orgId = c.get("user").orgId;
    const s = await loadSite(db, orgId);
    const reqs = await db
      .select({ status: productRequests.status, createdAt: productRequests.createdAt })
      .from(productRequests)
      .where(
        and(
          eq(productRequests.orgId, orgId),
          gte(productRequests.createdAt, nowSec() - 90 * 86400),
        ),
      );
    const now = nowSec();
    const prods = await db
      .select({ slug: products.slug, status: products.status, showOnSite: products.showOnSite })
      .from(products)
      .where(eq(products.orgId, orgId));
    const keys = Object.keys(s.draft) as (keyof SiteContent)[];
    const changed = s.published
      ? keys.filter((k) => JSON.stringify(s.draft[k]) !== JSON.stringify(s.published?.[k]))
      : keys;
    return c.json({
      ok: true,
      changedSections: changed,
      requests: {
        last30: reqs.filter((r) => now - r.createdAt <= 30 * 86400).length,
        new: reqs.filter((r) => r.status === "new").length,
        stale: reqs.filter((r) => r.status === "new" && now - r.createdAt > 3 * 86400).length,
        won: reqs.filter((r) => r.status === "won").length,
        total: reqs.length,
      },
      listedSlugs: prods.filter((p) => p.status === "published" && p.showOnSite).map((p) => p.slug),
      unlistedPublished: prods.filter((p) => p.status === "published" && !p.showOnSite).length,
    });
  })

  .post("/unpublish", async (c) => {
    await c
      .get("db")
      .update(siteSettings)
      .set({ published: "", publishedAt: 0 })
      .where(eq(siteSettings.orgId, c.get("user").orgId));
    return c.json({ ok: true });
  });
