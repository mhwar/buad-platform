import { assets, orgProfile, orgs } from "@buad/schema/db";
import { orgProfilePatch } from "@buad/schema/org";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRole, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { assetUrl } from "./assets";
import { nowSec } from "./common";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const ASSET_FIELDS = [
  "logoAsset",
  "stampAsset",
  "signatureAsset",
  "headerAsset",
  "footerAsset",
] as const;

export async function loadOrgProfile(db: Db, orgId: string) {
  const [row] = await db.select().from(orgProfile).where(eq(orgProfile.orgId, orgId)).limit(1);
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const p = row ?? {
    orgId,
    name: org?.name ?? "",
    email: "",
    phone: "",
    website: "",
    address: "",
    reg: "",
    tax: "",
    signerName: "",
    signerTitle: "",
    signerId: "",
    bankName: "",
    bankIban: "",
    logoAsset: "",
    stampAsset: "",
    signatureAsset: "",
    headerAsset: "",
    footerAsset: "",
    version: 0,
    updatedBy: "",
    updatedAt: 0,
  };
  return {
    ...p,
    urls: Object.fromEntries(ASSET_FIELDS.map((f) => [f, assetUrl(p[f])])) as Record<
      (typeof ASSET_FIELDS)[number],
      string
    >,
  };
}

export const orgApp = new Hono<Env>()
  .use(requireAuth)
  .get("/profile", async (c) =>
    c.json({ ok: true, profile: await loadOrgProfile(c.get("db"), c.get("user").orgId) }),
  )
  .patch(
    "/profile",
    requireRole("owner", "admin"),
    zValidator("json", orgProfilePatch),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const { version, ...v } = c.req.valid("json");
      // Images must be this org's own assets.
      const ids = ASSET_FIELDS.map((f) => v[f]).filter((x): x is string => !!x);
      if (ids.length) {
        const own = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.orgId, me.orgId), inArray(assets.id, ids)));
        if (own.length !== new Set(ids).size)
          return c.json({ ok: false, error: "invalid_asset" }, 400);
      }
      const [row] = await db
        .select({ version: orgProfile.version })
        .from(orgProfile)
        .where(eq(orgProfile.orgId, me.orgId))
        .limit(1);
      const current = row?.version ?? 0;
      if (version !== current) return c.json({ ok: false, error: "stale", version: current }, 409);
      const t = nowSec();
      if (!row) {
        const base = await loadOrgProfile(db, me.orgId);
        const { urls: _u, ...defaults } = base;
        const ins = await db
          .insert(orgProfile)
          .values({
            ...defaults,
            ...v,
            orgId: me.orgId,
            version: 1,
            updatedBy: me.id,
            updatedAt: t,
          })
          .onConflictDoNothing()
          .returning({ v: orgProfile.version });
        if (!ins.length) return c.json({ ok: false, error: "stale", version: 1 }, 409);
      } else {
        const upd = await db
          .update(orgProfile)
          .set({ ...v, version: current + 1, updatedBy: me.id, updatedAt: t })
          .where(and(eq(orgProfile.orgId, me.orgId), eq(orgProfile.version, current)))
          .returning({ v: orgProfile.version });
        if (!upd.length) return c.json({ ok: false, error: "stale", version: current + 1 }, 409);
      }
      return c.json({ ok: true, profile: await loadOrgProfile(db, me.orgId) });
    },
  );
