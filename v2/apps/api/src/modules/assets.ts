import { assets } from "@buad/schema/db";
import { ASSET_MIME, MAX_ASSET_BYTES } from "@buad/schema/org";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";

/** The subset of the R2 binding we use (lets tests pass an in-memory stand-in). */
export type FileStore = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};
type Env = { Bindings: { JWT_SECRET: string; FILES?: FileStore }; Variables: Vars };

/** The bytes must really be the image type claimed (never trust the browser's label). */
export function sniffImage(b: Uint8Array): (typeof ASSET_MIME)[number] | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")))
    return "image/svg+xml";
  return null;
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Stores bytes once per org (same content → same asset id). */
export async function storeAsset(
  db: Db,
  files: FileStore,
  orgId: string,
  userId: string,
  bytes: Uint8Array,
) {
  const mime = sniffImage(bytes);
  if (!mime) return { error: "unsupported_type" as const };
  if (bytes.byteLength > MAX_ASSET_BYTES) return { error: "too_large" as const };
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  const [existing] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), eq(assets.sha256, sha)))
    .limit(1);
  if (existing) return { id: existing.id, mime, deduplicated: true };
  const id = newId("ast");
  const key = `org/${orgId}/${sha}`;
  await files.put(key, bytes, { httpMetadata: { contentType: mime } });
  await db
    .insert(assets)
    .values({
      id,
      orgId,
      sha256: sha,
      mime,
      size: bytes.byteLength,
      r2Key: key,
      createdBy: userId,
      createdAt: nowSec(),
    })
    .onConflictDoNothing();
  // A concurrent upload of the same bytes may have won: return whichever row exists.
  const [row] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), eq(assets.sha256, sha)))
    .limit(1);
  return { id: row?.id ?? id, mime, deduplicated: false };
}

export const assetUrl = (id: string) => (id ? `/api/assets/${id}` : "");

export const assetsApp = new Hono<Env>()
  .use(requireAuth)

  // Upload: raw image bytes in the body (no base64 round-trip).
  .post("/", requirePerm("assets.edit"), async (c) => {
    if (!c.env.FILES) return c.json({ ok: false, error: "storage_unavailable" }, 503);
    const len = Number(c.req.header("content-length") ?? 0);
    if (len > MAX_ASSET_BYTES) return c.json({ ok: false, error: "too_large" }, 413);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const r = await storeAsset(
      c.get("db"),
      c.env.FILES,
      c.get("user").orgId,
      c.get("user").id,
      bytes,
    );
    if ("error" in r)
      return c.json({ ok: false, error: r.error }, r.error === "too_large" ? 413 : 415);
    return c.json({ ok: true, id: r.id, url: assetUrl(r.id), deduplicated: r.deduplicated }, 201);
  })

  .get("/:id", async (c) => {
    const res = await assetResponse(
      c.get("db"),
      c.env.FILES,
      c.get("user").orgId,
      c.req.param("id"),
    );
    return res ?? c.json({ ok: false, error: "not_found" }, 404);
  });

/** An org's stored image as a response (sandboxed, cached forever: ids are content-addressed). */
export async function assetResponse(
  db: Db,
  files: FileStore | undefined,
  orgId: string,
  id: string,
): Promise<Response | null> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.orgId, orgId)))
    .limit(1);
  const obj = row && files ? await files.get(row.r2Key) : null;
  if (!row || !obj) return null;
  return new Response(new Uint8Array(await obj.arrayBuffer()), {
    headers: {
      "Content-Type": row.mime,
      // Content-addressed: the bytes behind an id never change.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
