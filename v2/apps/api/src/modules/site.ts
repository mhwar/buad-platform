import { assets, siteSettings } from "@buad/schema/db";
import { DEFAULT_SITE, type SiteContent, siteContent, sitePatch } from "@buad/schema/site";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { nowSec } from "./common";
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
  .use(requireRole("owner", "admin"))

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
    if (content.brand.logoAsset) {
      const [a] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.id, content.brand.logoAsset), eq(assets.orgId, me.orgId)))
        .limit(1);
      if (!a) return c.json({ ok: false, error: "invalid_asset" }, 400);
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
    return c.json({ ok: true, publishedAt: t });
  })

  .post("/unpublish", async (c) => {
    await c
      .get("db")
      .update(siteSettings)
      .set({ published: "", publishedAt: 0 })
      .where(eq(siteSettings.orgId, c.get("user").orgId));
    return c.json({ ok: true });
  });
