import { resolveVariables } from "@buad/domain";
import { documentShares, documents, documentVersions, projects } from "@buad/schema/db";
import { layoutSchema } from "@buad/schema/documents";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { assetResponse, type FileStore } from "./assets";
import { newId, nowSec } from "./common";
import { buildContext, loadDoc } from "./documents";
import { ASSET_FIELDS, loadOrgProfile } from "./org";

/* ─────────────────────────────────────────────────────────────────────────────
 * Share links: an approved document sent to someone outside the platform.
 *  - the link carries a random 256-bit token; only its SHA-256 is stored
 *  - it shows the last APPROVED version (a reopened draft never leaks), read-only
 *  - it expires (7 or 30 days) and can be revoked; views are counted
 * ──────────────────────────────────────────────────────────────────────────── */

type Env = { Bindings: { JWT_SECRET: string; FILES?: FileStore }; Variables: Vars };

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
const newToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

const createShare = z.object({
  days: z.union([z.literal(7), z.literal(30)]).default(7),
  channel: z.enum(["whatsapp", "email", "link"]).default("link"),
});

export const documentSharesApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRole("owner", "admin"))

  .get("/", async (c) => {
    const db = c.get("db");
    const found = await loadDoc(db, c.get("user"), c.req.param("docId") ?? "");
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    const items = await db
      .select({
        id: documentShares.id,
        channel: documentShares.channel,
        createdAt: documentShares.createdAt,
        expiresAt: documentShares.expiresAt,
        revokedAt: documentShares.revokedAt,
        views: documentShares.views,
        lastViewedAt: documentShares.lastViewedAt,
      })
      .from(documentShares)
      .where(eq(documentShares.documentId, found.doc.id))
      .orderBy(desc(documentShares.createdAt));
    return c.json({ ok: true, items });
  })

  .post("/", zValidator("json", createShare), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const found = await loadDoc(db, me, c.req.param("docId") ?? "");
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    // Only what was approved can leave the platform.
    const [approved] = await db
      .select({ n: sql<number>`count(*)` })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, found.doc.id));
    if (found.doc.status !== "approved" || !approved?.n)
      return c.json({ ok: false, error: "not_approved" }, 409);
    const { days, channel } = c.req.valid("json");
    const token = newToken();
    const t = nowSec();
    await db.insert(documentShares).values({
      id: newId("shr"),
      orgId: me.orgId,
      documentId: found.doc.id,
      tokenHash: await sha256Hex(token),
      channel,
      createdBy: me.id,
      createdAt: t,
      expiresAt: t + days * 86400,
    });
    // The token is returned once; it cannot be read back later.
    return c.json({ ok: true, path: `/s/${token}`, expiresAt: t + days * 86400 }, 201);
  })

  .delete("/:shareId", async (c) => {
    const db = c.get("db");
    const found = await loadDoc(db, c.get("user"), c.req.param("docId") ?? "");
    if (!found) return c.json({ ok: false, error: "not_found" }, 404);
    await db
      .update(documentShares)
      .set({ revokedAt: nowSec() })
      .where(
        and(
          eq(documentShares.id, c.req.param("shareId")),
          eq(documentShares.documentId, found.doc.id),
        ),
      );
    return c.json({ ok: true });
  });

/** A live share for this token, or null (unknown, expired and revoked all look the same). */
async function liveShare(db: Db, token: string) {
  if (!/^[\w-]{40,64}$/.test(token)) return null;
  const [s] = await db
    .select()
    .from(documentShares)
    .where(eq(documentShares.tokenHash, await sha256Hex(token)))
    .limit(1);
  if (!s || s.revokedAt || s.expiresAt <= nowSec()) return null;
  return s;
}

type Snapshot = {
  document: {
    kind: "contract" | "letter";
    number: string;
    title: string;
    content: unknown[];
    layout: Record<string, unknown> & {
      headerAsset?: string;
      footerAsset?: string;
      stampAsset?: string;
    };
  };
  values?: Record<string, unknown>;
};

/**
 * The approved document as it was approved. Documents approved in v1 were imported with a raw
 * snapshot (no filled values): for those, the stored row is the approved content (any later
 * approval in v2 writes a full snapshot), and values are filled from today's data.
 */
async function approvedView(db: Db, orgId: string, documentId: string, raw: string) {
  const snap = JSON.parse(raw) as Snapshot & { importedFromV1?: boolean };
  if (snap.values && !snap.importedFromV1) return snap as Required<Snapshot>;
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const [project] = row
    ? await db.select().from(projects).where(eq(projects.id, row.projectId)).limit(1)
    : [];
  if (!row || !project) return { document: snap.document, values: {} };
  const variables = JSON.parse(row.variables) as Record<string, string>;
  return {
    document: {
      kind: row.kind,
      number: row.number,
      title: row.title,
      content: JSON.parse(row.content) as unknown[],
      layout: layoutSchema.parse(JSON.parse(row.layout)),
    },
    values: resolveVariables(variables, await buildContext(db, project, orgId)),
  };
}

export const publicShareApp = new Hono<Env>()
  .use(async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "no-referrer");
  })

  .get("/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token");
    const share = await liveShare(db, token);
    if (!share) return c.json({ ok: false, error: "not_found" }, 404);
    const [ver] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, share.documentId))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    const [row] = await db
      .select({ outgoingNo: documents.outgoingNo, projectNumber: projects.number })
      .from(documents)
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(eq(documents.id, share.documentId))
      .limit(1);
    if (!ver || !row) return c.json({ ok: false, error: "not_found" }, 404);
    await db
      .update(documentShares)
      .set({ views: sql`${documentShares.views} + 1`, lastViewedAt: nowSec() })
      .where(eq(documentShares.id, share.id));
    const snap = await approvedView(db, share.orgId, share.documentId, ver.snapshot);
    const org = await loadOrgProfile(db, share.orgId);
    const base = `/api/public/s/${token}/assets/`;
    const urls = Object.fromEntries(
      ASSET_FIELDS.map((f) => [f, org[f] ? `${base}${org[f]}` : ""]),
    ) as Record<string, string>;
    return c.json({
      ok: true,
      document: snap.document,
      values: snap.values,
      org: { name: org.name, urls },
      outgoing: row.outgoingNo ? `${row.outgoingNo} / ${row.projectNumber}` : "",
      approvedAt: ver.approvedAt,
      expiresAt: share.expiresAt,
    });
  })

  // Only images that this document (as approved) or its organisation's letterhead use.
  .get("/:token/assets/:assetId", async (c) => {
    const db = c.get("db");
    const share = await liveShare(db, c.req.param("token"));
    if (!share) return c.json({ ok: false, error: "not_found" }, 404);
    const id = c.req.param("assetId");
    const [ver] = await db
      .select({ snapshot: documentVersions.snapshot })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, share.documentId))
      .orderBy(desc(documentVersions.version))
      .limit(1);
    const layout = ver
      ? (await approvedView(db, share.orgId, share.documentId, ver.snapshot)).document.layout
      : {};
    const org = await loadOrgProfile(db, share.orgId);
    const allowed = new Set(
      [
        layout.headerAsset,
        layout.footerAsset,
        layout.stampAsset,
        ...ASSET_FIELDS.map((f) => org[f]),
      ].filter(Boolean),
    );
    if (!allowed.has(id)) return c.json({ ok: false, error: "not_found" }, 404);
    const res = await assetResponse(db, c.env.FILES, share.orgId, id);
    return res ?? c.json({ ok: false, error: "not_found" }, 404);
  });
