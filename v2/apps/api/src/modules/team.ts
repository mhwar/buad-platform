import {
  allRoles,
  canAssignRole,
  DEFAULT_ROLES,
  defaultRole,
  effectiveRoleKey,
  normalizePerms,
  OWNER_KEY,
} from "@buad/domain";
import { orgRoles, projectMembers, users } from "@buad/schema/db";
import { roleCreate, roleSave, userInvite, userPatch } from "@buad/schema/team";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import { type Db, getUser, loadRoleRows } from "../auth/service";
import { signSetup } from "../auth/session";
import { audit } from "./audit";
import { loadVisible } from "./projects";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

async function roleExists(db: Db, orgId: string, key: string) {
  if (defaultRole(key)) return true;
  const rows = await loadRoleRows(db, orgId);
  return rows.some((r) => r.key === key);
}

async function activeOwners(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.active, true)));
  return rows.filter((u) => effectiveRoleKey(u.roleKey, u.role) === OWNER_KEY);
}

/** The old three-value role kept in step, for the few places that still read it. */
const legacyOf = (key: string): "owner" | "admin" | "member" =>
  key === OWNER_KEY ? "owner" : key === "general-manager" ? "admin" : "member";

export const teamApp = new Hono<Env>()
  .use(requireAuth)

  .get("/users", requirePerm("team.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const roles = allRoles(await loadRoleRows(db, me.orgId));
    const rows = await db.select().from(users).where(eq(users.orgId, me.orgId));
    return c.json({
      ok: true,
      users: rows.map((u) => {
        const key = effectiveRoleKey(u.roleKey, u.role);
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          roleKey: key,
          roleName: roles.find((r) => r.key === key)?.name ?? "دور محذوف",
          active: u.active,
          pending: u.mustChangePass,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        };
      }),
    });
  })

  .post("/users", requirePerm("team.manage"), zValidator("json", userInvite), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    if (!(await roleExists(db, me.orgId, v.roleKey)))
      return c.json({ ok: false, error: "role_not_found" }, 404);
    if (!canAssignRole(me.roleKey, v.roleKey))
      return c.json({ ok: false, error: "forbidden" }, 403);
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, v.email))
      .limit(1);
    if (dup) return c.json({ ok: false, error: "email_taken" }, 409);
    const id = `usr_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await db.insert(users).values({
      id,
      orgId: me.orgId,
      email: v.email,
      name: v.name,
      mustChangePass: true,
      role: legacyOf(v.roleKey),
      roleKey: v.roleKey,
    });
    await audit(db, me, {
      entity: "user",
      entityId: id,
      action: "invite",
      summary: `دعوة ${v.name} بدور ${v.roleKey}`,
      detail: { email: v.email, roleKey: v.roleKey },
    });
    const target = await getUser(db, id);
    return c.json({ ok: true, id, setupToken: await signSetup(c.env.JWT_SECRET, target!) }, 201);
  })

  .patch("/users/:id", requirePerm("team.manage"), zValidator("json", userPatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, c.req.param("id")), eq(users.orgId, me.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    const current = effectiveRoleKey(row.roleKey, row.role);
    const nextKey = v.roleKey ?? current;
    if (v.roleKey !== undefined && !(await roleExists(db, me.orgId, v.roleKey)))
      return c.json({ ok: false, error: "role_not_found" }, 404);
    // Only an owner may create, change or switch off an owner.
    if (!canAssignRole(me.roleKey, nextKey) || !canAssignRole(me.roleKey, current))
      return c.json({ ok: false, error: "forbidden" }, 403);
    const losesOwner =
      current === OWNER_KEY && (nextKey !== OWNER_KEY || v.active === false) && row.active;
    if (losesOwner && (await activeOwners(db, me.orgId)).length <= 1)
      return c.json({ ok: false, error: "last_owner" }, 409);
    const set: Partial<typeof users.$inferInsert> = {};
    if (v.name !== undefined) set.name = v.name;
    if (v.roleKey !== undefined) {
      set.roleKey = v.roleKey;
      set.role = legacyOf(v.roleKey);
    }
    if (v.active !== undefined && v.active !== row.active) {
      set.active = v.active;
      set.tokenVersion = row.tokenVersion + 1; // signs the person out everywhere
    }
    if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, row.id));
    if (v.roleKey !== undefined && v.roleKey !== current)
      await audit(db, me, {
        entity: "user",
        entityId: row.id,
        action: "role",
        summary: `تغيير دور ${row.name} من ${current} إلى ${v.roleKey}`,
        detail: { from: current, to: v.roleKey },
      });
    if (v.active !== undefined && v.active !== row.active)
      await audit(db, me, {
        entity: "user",
        entityId: row.id,
        action: v.active ? "activate" : "deactivate",
        summary: `${v.active ? "إعادة تفعيل" : "إيقاف"} حساب ${row.name}`,
      });
    return c.json({ ok: true });
  })

  .post("/users/:id/reset", requirePerm("team.manage"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const target = await getUser(db, c.req.param("id"));
    if (!target || target.orgId !== me.orgId) return c.json({ ok: false, error: "not_found" }, 404);
    if (!canAssignRole(me.roleKey, target.roleKey))
      return c.json({ ok: false, error: "forbidden" }, 403);
    await audit(db, me, {
      entity: "user",
      entityId: target.id,
      action: "reset",
      summary: `رابط تعيين كلمة مرور لـ ${target.name}`,
    });
    return c.json({ ok: true, setupToken: await signSetup(c.env.JWT_SECRET, target) });
  })

  // ─── roles ───────────────────────────────────────────────────────────────
  .get("/roles", requirePerm("team.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const overrides = await loadRoleRows(db, me.orgId);
    const rows = await db.select().from(users).where(eq(users.orgId, me.orgId));
    const count = new Map<string, number>();
    for (const u of rows.filter((r) => r.active)) {
      const k = effectiveRoleKey(u.roleKey, u.role);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return c.json({
      ok: true,
      roles: allRoles(overrides).map((r) => ({
        ...r,
        builtin: !!defaultRole(r.key),
        edited: overrides.some((o) => o.key === r.key) && !!defaultRole(r.key),
        users: count.get(r.key) ?? 0,
      })),
    });
  })

  .post("/roles", requirePerm("roles.manage"), zValidator("json", roleCreate), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    if (await roleExists(db, me.orgId, v.key))
      return c.json({ ok: false, error: "key_taken" }, 409);
    await db.insert(orgRoles).values({
      orgId: me.orgId,
      key: v.key,
      name: v.name,
      description: v.description,
      perms: JSON.stringify(normalizePerms(v.perms)),
      scopes: JSON.stringify(v.scopes),
      updatedBy: me.id,
    });
    await audit(db, me, {
      entity: "role",
      entityId: v.key,
      action: "create",
      summary: `إنشاء دور «${v.name}»`,
    });
    return c.json({ ok: true }, 201);
  })

  .put("/roles/:key", requirePerm("roles.manage"), zValidator("json", roleSave), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const key = c.req.param("key");
    if (key === OWNER_KEY) return c.json({ ok: false, error: "owner_fixed" }, 400);
    if (!(await roleExists(db, me.orgId, key)))
      return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    const perms = normalizePerms(v.perms);
    const before = allRoles(await loadRoleRows(db, me.orgId)).find((r) => r.key === key);
    const values = {
      name: v.name,
      description: v.description,
      perms: JSON.stringify(perms),
      scopes: JSON.stringify(v.scopes),
      updatedBy: me.id,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    await db
      .insert(orgRoles)
      .values({ orgId: me.orgId, key, ...values })
      .onConflictDoUpdate({ target: [orgRoles.orgId, orgRoles.key], set: values });
    const was = new Set(before?.perms ?? []);
    const now = new Set(perms);
    await audit(db, me, {
      entity: "role",
      entityId: key,
      action: "update",
      summary: `تعديل صلاحيات دور «${v.name}»`,
      detail: {
        added: perms.filter((p) => !was.has(p)),
        removed: [...was].filter((p) => !now.has(p)),
      },
    });
    return c.json({ ok: true });
  })

  .delete("/roles/:key", requirePerm("roles.manage"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const key = c.req.param("key");
    if (key === OWNER_KEY) return c.json({ ok: false, error: "owner_fixed" }, 400);
    const builtin = DEFAULT_ROLES.some((r) => r.key === key);
    if (!builtin) {
      const rows = await db
        .select({ k: users.roleKey })
        .from(users)
        .where(and(eq(users.orgId, me.orgId), eq(users.roleKey, key)));
      if (rows.length) return c.json({ ok: false, error: "role_in_use" }, 409);
    }
    await db.delete(orgRoles).where(and(eq(orgRoles.orgId, me.orgId), eq(orgRoles.key, key)));
    await audit(db, me, {
      entity: "role",
      entityId: key,
      action: builtin ? "reset" : "delete",
      summary: builtin ? `إعادة دور «${key}» إلى الوضع الجاهز` : `حذف الدور «${key}»`,
    });
    return c.json({ ok: true });
  })

  // ─── project members ─────────────────────────────────────────────────────
  .get("/projects/:id/members", requirePerm("projects.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const p = await loadVisible(db, me, c.req.param("id"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, p.id));
    return c.json({ ok: true, userIds: rows.map((r) => r.userId) });
  })

  .put(
    "/projects/:id/members",
    requirePerm("projects.edit"),
    zValidator("json", z.object({ userIds: z.array(z.string().max(60)).max(50) })),
    async (c) => {
      const me = c.get("user");
      const db = c.get("db");
      const p = await loadVisible(db, me, c.req.param("id"));
      if (!p) return c.json({ ok: false, error: "not_found" }, 404);
      const ids = [...new Set(c.req.valid("json").userIds)];
      const valid = ids.length
        ? await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.orgId, me.orgId), eq(users.active, true), inArray(users.id, ids)))
        : [];
      await db.delete(projectMembers).where(eq(projectMembers.projectId, p.id));
      if (valid.length)
        await db
          .insert(projectMembers)
          .values(valid.map((u) => ({ projectId: p.id, userId: u.id })));
      await audit(db, me, {
        entity: "project",
        entityId: p.id,
        action: "members",
        summary: `تحديث فريق المشروع ${p.name} (${valid.length})`,
      });
      return c.json({ ok: true, userIds: valid.map((u) => u.id) });
    },
  );
