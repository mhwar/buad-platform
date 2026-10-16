import { siteSettings } from "@buad/schema/db";
import { siteContent } from "@buad/schema/site";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { Db } from "../auth/service";
import { PLATFORM_ORG_ID } from "../auth/setup";
import { contentOf, listedProducts } from "./products";

/* ─────────────────────────────────────────────────────────────────────────────
 * Link previews for the public website. The app is a client-side SPA, so a shared /site link
 * would show the platform's own title. For /site pages the Worker serves the same index.html but
 * rewrites <title>, the description and Open Graph tags from the PUBLISHED site (never the draft).
 * Anything unexpected falls back to the untouched page.
 * ──────────────────────────────────────────────────────────────────────────── */

type Assets = { fetch: (req: Request) => Promise<Response> };
type Ctx = Context<{ Bindings: { ASSETS?: Assets }; Variables: { db: Db } }>;

/** Minimal shape of the Workers HTMLRewriter (absent in tests and in the web typecheck). */
type Element = {
  setInnerContent(s: string): unknown;
  setAttribute(n: string, v: string): unknown;
  append(s: string, o: { html: boolean }): unknown;
};
type Rewriter = {
  on(selector: string, h: { element: (e: Element) => unknown }): Rewriter;
  transform(r: Response): Response;
};
const RewriterCtor: (new () => Rewriter) | undefined = (
  globalThis as { HTMLRewriter?: new () => Rewriter }
).HTMLRewriter;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

async function metaFor(db: Db, path: string) {
  const [row] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.orgId, PLATFORM_ORG_ID))
    .limit(1);
  if (!row?.published) return null;
  const site = siteContent.parse(JSON.parse(row.published));
  const m = /^\/site\/p\/([^/]+)\/?$/.exec(path);
  if (m) {
    const prod = (await listedProducts(db, PLATFORM_ORG_ID)).find((p) => p.slug === m[1]);
    if (prod) {
      const hero = contentOf(prod).hero;
      return {
        title: `${prod.name} | ${site.brand.name}`,
        description: hero.subtitle || prod.tagline || site.seo.description,
        image: hero.imageAsset || site.hero.imageAsset || site.brand.logoAsset,
        site,
      };
    }
  }
  return {
    title: site.seo.title || site.brand.name,
    description: site.seo.description,
    image: site.hero.imageAsset || site.brand.logoAsset,
    site,
  };
}

export async function siteMeta(c: Ctx): Promise<Response> {
  const assets = c.env.ASSETS;
  if (!assets) return c.notFound();
  // A copy: the assets response has immutable headers, and later middleware adds its own.
  const raw = await assets.fetch(c.req.raw);
  const res = new Response(raw.body, raw);
  // Static files under /site (the logo) and anything that is not the HTML shell pass through.
  if (!res.headers.get("content-type")?.includes("text/html")) return res;
  const Ctor = RewriterCtor;
  if (!Ctor) return res;
  try {
    const url = new URL(c.req.url);
    const meta = await metaFor(c.get("db"), url.pathname);
    if (!meta) return res;
    // The share card: the page's own photo, else the uploaded logo, else the bundled one.
    const image = meta.image
      ? `${url.origin}/api/public/site/assets/${meta.image}`
      : `${url.origin}/site/logo.png`;
    const c0 = meta.site.contact;
    // Structured data so search engines know who the organisation is and how to reach it.
    const org = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: meta.site.brand.name,
      url: `${url.origin}/site`,
      logo: `${url.origin}${meta.site.brand.logoAsset ? `/api/public/site/assets/${meta.site.brand.logoAsset}` : "/site/logo.png"}`,
      ...(c0.email ? { email: c0.email } : {}),
      ...(c0.phone ? { telephone: c0.phone } : {}),
      sameAs: Object.values(c0.socials ?? {}).filter(Boolean),
    };
    const out = new Ctor()
      .on("title", { element: (e) => void e.setInnerContent(meta.title) })
      .on('meta[name="description"]', {
        element: (e) => void e.setAttribute("content", meta.description),
      })
      .on("head", {
        element: (e) =>
          void e.append(
            `<meta property="og:type" content="website"><meta property="og:locale" content="ar_SA">` +
              `<meta property="og:title" content="${esc(meta.title)}">` +
              `<meta property="og:description" content="${esc(meta.description)}">` +
              `<meta property="og:url" content="${esc(url.origin + url.pathname)}">` +
              `<meta property="og:image" content="${esc(image)}">` +
              `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">` +
              `<script type="application/ld+json">${JSON.stringify(org).replace(/</g, "\\u003c")}</script>`,
            { html: true },
          ),
      })
      .transform(res);
    return new Response(out.body, out);
  } catch {
    return res;
  }
}
