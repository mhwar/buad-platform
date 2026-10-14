import { productRequests, siteSettings } from "@buad/schema/db";
import { type IntakeQuestion, productContent, requestInput } from "@buad/schema/products";
import { type SiteContent, siteAssetIds, siteContent } from "@buad/schema/site";
import { zValidator } from "@hono/zod-validator";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../auth/service";
import { PLATFORM_ORG_ID } from "../auth/setup";
import { assetResponse, type FileStore } from "./assets";
import { newId, nowSec } from "./common";
import { type BrowserBinding, pdfResponse, renderPdf } from "./pdf";
import { contentOf, listedProducts } from "./products";

/* ─────────────────────────────────────────────────────────────────────────────
 * The public website API (no sign-in). Serves ONLY the published snapshot and published,
 * listed products' `content`: costs and margins live in `pricing`, which is never selected into
 * any response here. Quote requests are accepted with a honeypot, size caps and per-IP limits.
 * The deployment has one organisation, so its id is the platform org.
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = {
  Bindings: { JWT_SECRET: string; FILES?: FileStore; BROWSER?: BrowserBinding };
  Variables: { db: Db };
};
const ORG = PLATFORM_ORG_ID;

const PER_IP_HOUR = 5;
const PER_DAY = 200;

async function publishedSite(db: Db) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.orgId, ORG)).limit(1);
  if (!row?.published) return null;
  try {
    return siteContent.parse(JSON.parse(row.published));
  } catch {
    return null;
  }
}

const logoUrl = (asset: string) => (asset ? `/api/public/site/assets/${asset}` : "/site/logo.png");

const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Public view of a product: its content only, never its pricing. */
const publicProduct = (row: Parameters<typeof contentOf>[0]) => ({
  slug: row.slug,
  name: row.name,
  tagline: row.tagline,
  content: productContent.parse(contentOf(row)),
});

const answerText = (v: string) => v.trim();

/** What the home page needs: the site content, its logo and the listed products' cards. */
export async function siteHomePayload(db: Db, site: SiteContent) {
  const prods = await listedProducts(db, ORG);
  return {
    ok: true as const,
    published: true as const,
    site,
    logoUrl: logoUrl(site.brand.logoAsset),
    products: prods.map((p) => {
      const pc = contentOf(p);
      return {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        hero: pc.hero,
        packages: pc.packages.length,
        intake: pc.intake,
      };
    }),
  };
}

export const publicSiteApp = new Hono<Env>()
  .use(async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control"))
      c.res.headers.set("Cache-Control", "public, max-age=60");
  })

  .get("/", async (c) => {
    const db = c.get("db");
    const site = await publishedSite(db);
    if (!site) return c.json({ ok: true, published: false });
    return c.json(await siteHomePayload(db, site));
  })

  .get("/products/:slug", async (c) => {
    const db = c.get("db");
    const site = await publishedSite(db);
    const prod = (await listedProducts(db, ORG)).find((p) => p.slug === c.req.param("slug"));
    if (!site || !prod) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({
      ok: true,
      site: {
        brand: site.brand,
        contact: site.contact,
        seo: site.seo,
        cta: site.cta,
        form: site.form,
      },
      logoUrl: logoUrl(site.brand.logoAsset),
      product: publicProduct(prod),
    });
  })

  // The service profile PDF: rendered once per (product version, published site) and kept in R2,
  // so repeated downloads cost nothing and cannot exhaust the browser quota.
  .post("/products/:slug/brochure", async (c) => {
    c.header("Cache-Control", "no-store");
    const db = c.get("db");
    const slug = c.req.param("slug");
    const site = await publishedSite(db);
    const prod = (await listedProducts(db, ORG)).find((p) => p.slug === slug);
    if (!site || !prod || contentOf(prod).brochure === false)
      return c.json({ ok: false, error: "not_found" }, 404);
    const [st] = await db
      .select({ at: siteSettings.publishedAt })
      .from(siteSettings)
      .where(eq(siteSettings.orgId, ORG))
      .limit(1);
    const key = `brochures/${ORG}/${prod.id}-v${prod.version}-s${st?.at ?? 0}.pdf`;
    const name = `${slug}-profile`;
    const cached = c.env.FILES ? await c.env.FILES.get(key) : null;
    if (cached) return pdfResponse(new Uint8Array(await cached.arrayBuffer()), name);
    if (!c.env.BROWSER) return c.json({ ok: false, error: "pdf_unavailable" }, 503);
    try {
      const url = new URL(`/site/p/${slug}/brochure?render=1`, c.req.url).toString();
      const pdf = await renderPdf(c.env.BROWSER, url);
      await c.env.FILES?.put(key, pdf, { httpMetadata: { contentType: "application/pdf" } });
      return pdfResponse(pdf, name);
    } catch {
      return c.json({ ok: false, error: "pdf_unavailable" }, 503);
    }
  })

  // Only images the published site actually uses (brand logo, entity logos).
  .get("/assets/:id", async (c) => {
    const db = c.get("db");
    const site = await publishedSite(db);
    const id = c.req.param("id");
    if (!site || !id || !siteAssetIds(site).includes(id))
      return c.json({ ok: false, error: "not_found" }, 404);
    const res = await assetResponse(db, c.env.FILES, ORG, id);
    if (!res) return c.json({ ok: false, error: "not_found" }, 404);
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(res.body, { status: res.status, headers });
  })

  .post("/requests", zValidator("json", requestInput), async (c) => {
    c.header("Cache-Control", "no-store");
    const v = c.req.valid("json");
    // Same-site form posts only (when the browser says where it came from).
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host)
      return c.json({ ok: false, error: "bad_origin" }, 403);
    // Honeypot: a bot fills every field. Pretend it worked, store nothing.
    if (v.website) return c.json({ ok: true });
    if (!v.phone && !v.email) return c.json({ ok: false, error: "contact_required" }, 400);

    const db = c.get("db");
    if (!(await publishedSite(db))) return c.json({ ok: false, error: "not_found" }, 404);
    const prod = v.productSlug
      ? (await listedProducts(db, ORG)).find((p) => p.slug === v.productSlug)
      : undefined;
    if (v.productSlug && !prod) return c.json({ ok: false, error: "not_found" }, 404);

    // Answers are stored under the question labels that were shown, only for questions asked.
    const intake: IntakeQuestion[] = prod ? contentOf(prod).intake : [];
    const missing = intake.filter((q) => q.required && !answerText(v.answers[q.key] ?? ""));
    if (missing.length)
      return c.json({ ok: false, error: "missing_answers", keys: missing.map((q) => q.key) }, 400);
    const answers: Record<string, string> = {};
    for (const q of intake) {
      const a = answerText(v.answers[q.key] ?? "");
      if (a) answers[q.label] = a;
    }

    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local";
    const day = new Date().toISOString().slice(0, 10);
    const ipHash = await sha256(`${ip}|${ORG}|${day}`);
    const now = nowSec();
    const [perIp] = await db
      .select({ n: sql<number>`count(*)` })
      .from(productRequests)
      .where(and(eq(productRequests.ipHash, ipHash), gte(productRequests.createdAt, now - 3600)));
    if (Number(perIp?.n ?? 0) >= PER_IP_HOUR)
      return c.json({ ok: false, error: "rate_limited" }, 429);
    const [today] = await db
      .select({ n: sql<number>`count(*)` })
      .from(productRequests)
      .where(
        and(
          eq(productRequests.orgId, ORG),
          eq(productRequests.source, "site"),
          gte(productRequests.createdAt, now - 86400),
        ),
      );
    if (Number(today?.n ?? 0) >= PER_DAY) return c.json({ ok: false, error: "busy" }, 429);

    await db.insert(productRequests).values({
      id: newId("req"),
      orgId: ORG,
      productId: prod?.id ?? "",
      productName: prod?.name ?? "",
      source: "site",
      name: v.name,
      entity: v.entity,
      phone: v.phone,
      email: v.email,
      message: v.message,
      answers: JSON.stringify(answers),
      ipHash,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ ok: true }, 201);
  });
