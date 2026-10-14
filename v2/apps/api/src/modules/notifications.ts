import { effectiveRoleKey, type RoleRow, resolveRole } from "@buad/domain";
import { notifications, users } from "@buad/schema/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type Vars } from "../auth/middleware";
import { type Db, loadRoleRows } from "../auth/service";
import { newId, nowSec } from "./common";

/** Active users of an organisation whose role grants `perm`. */
export async function usersWithPerm(db: Db, orgId: string, perm: string, exceptId = "") {
  const roles: RoleRow[] = await loadRoleRows(db, orgId);
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.active, true)));
  return rows.filter(
    (u) =>
      u.id !== exceptId &&
      resolveRole(effectiveRoleKey(u.roleKey, u.role), roles)?.perms.includes(perm),
  );
}

/** Never throws into the caller: a missed notification must not undo the change itself. */
export async function notify(
  db: Db,
  orgId: string,
  userIds: string[],
  n: { kind: string; title: string; link?: string; dedupeKey?: string },
) {
  if (!userIds.length) return;
  try {
    await db
      .insert(notifications)
      .values(
        userIds.map((userId) => ({
          id: newId("ntf"),
          orgId,
          userId,
          kind: n.kind,
          title: n.title,
          link: n.link ?? "",
          dedupeKey: n.dedupeKey ? `${n.dedupeKey}` : "",
        })),
      )
      .onConflictDoNothing();
  } catch (err) {
    console.error("notify_failed", err);
  }
}

export const notificationsApp = new Hono<{ Variables: Vars }>()
  .use(requireAuth)
  .get("/", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, me.id))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
    const unread = (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, me.id), eq(notifications.readAt, 0)))
    )[0]?.n;
    return c.json({ ok: true, items, unread: Number(unread ?? 0) });
  })
  .post("/read-all", async (c) => {
    const me = c.get("user");
    await c
      .get("db")
      .update(notifications)
      .set({ readAt: nowSec() })
      .where(and(eq(notifications.userId, me.id), eq(notifications.readAt, 0)));
    return c.json({ ok: true });
  })
  .post("/:id/read", async (c) => {
    const me = c.get("user");
    await c
      .get("db")
      .update(notifications)
      .set({ readAt: nowSec() })
      .where(and(eq(notifications.id, c.req.param("id")), eq(notifications.userId, me.id)));
    return c.json({ ok: true });
  });
