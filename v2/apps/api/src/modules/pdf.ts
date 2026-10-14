import puppeteer, { type Browser } from "@cloudflare/puppeteer";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { requireAuth, type Vars } from "../auth/middleware";
import { SESSION_COOKIE } from "../auth/session";

/* ─────────────────────────────────────────────────────────────────────────────
 * Real (vector) PDFs: Chrome's own print engine (Cloudflare Browser Run) opens the app's
 * print page and saves it as PDF — selectable Arabic text, sharp at any zoom, exact A4
 * (the print CSS already lays out 210×297mm pages). The page is opened as the caller
 * (their session cookie), so it shows exactly what they may see.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The Browser Run binding (a Workers `Fetcher`). */
export type BrowserBinding = Parameters<typeof puppeteer.launch>[0];
type Env = { Bindings: { JWT_SECRET: string; BROWSER?: BrowserBinding }; Variables: Vars };

/** Only these app pages can be printed (no open proxy). */
const ALLOWED = [
  /^\/print\/documents\/[\w-]+$/,
  /^\/clients\/[\w-]+\/statement$/,
  /^\/finance\/report(\?[\w=&%.-]*)?$/,
  /^\/finance\/vat\/report(\?[\w=&%.-]*)?$/,
  /^\/print\/finance\/[\w-]+(\?mode=(client|detailed))?$/,
];
export const isPrintable = (path: string) => ALLOWED.some((r) => r.test(path));

/** Reuse an idle browser (free plan: one new browser per 20 s), else start one kept warm. */
async function browserFor(binding: BrowserBinding): Promise<Browser> {
  try {
    const idle = (await puppeteer.sessions(binding)).find((s) => !s.connectionId);
    if (idle) return await puppeteer.connect(binding, idle.sessionId);
  } catch {
    // fall through to a fresh browser
  }
  return puppeteer.launch(binding, { keep_alive: 60_000 });
}

/** Opens `url` (optionally signed in), waits for the measured pages, and prints to PDF. */
export async function renderPdf(
  binding: BrowserBinding,
  url: string,
  session?: string,
): Promise<Uint8Array> {
  const browser = await browserFor(binding);
  try {
    const page = await browser.newPage();
    if (session)
      await page.setCookie({
        name: SESSION_COOKIE,
        value: session,
        domain: new URL(url).hostname,
        path: "/",
        httpOnly: true,
        secure: url.startsWith("https:"),
      });
    // Screen media while loading: the pages are measured on screen (the measuring copy is
    // hidden in print). page.pdf() then prints those finished pages.
    await page.setViewport({ width: 1200, height: 1600 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector(".print-root .doc-pages[data-ready]", { timeout: 25_000 });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await page.close();
    return new Uint8Array(pdf);
  } finally {
    // Keep the browser alive for the next PDF; only drop our connection.
    browser.disconnect();
  }
}

export const pdfResponse = (pdf: Uint8Array, name: string) =>
  new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]+/g, "-") || "document"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });

export const pdfApp = new Hono<Env>()
  .use(requireAuth)
  .post(
    "/",
    zValidator("json", z.object({ path: z.string().max(300), name: z.string().max(80) })),
    async (c) => {
      const { path, name } = c.req.valid("json");
      if (!isPrintable(path)) return c.json({ ok: false, error: "not_printable" }, 400);
      if (!c.env.BROWSER) return c.json({ ok: false, error: "pdf_unavailable" }, 503);
      try {
        const url = new URL(path, c.req.url).toString();
        const pdf = await renderPdf(c.env.BROWSER, url, getCookie(c, SESSION_COOKIE));
        return pdfResponse(pdf, name);
      } catch {
        return c.json({ ok: false, error: "pdf_unavailable" }, 503);
      }
    },
  );
