import { cleanTags, followUpState, relationshipOf } from "@buad/domain";
import { activityInput, crmPatch, followupQuery } from "@buad/schema/crm";
import { clients, crmActivities, productRequests, projects, quotes, users } from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { notify } from "./notifications";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const today = () => new Date().toISOString().slice(0, 10);
const epochOf = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 1000);
const OPEN = ["new", "contacted", "quoted", "negotiating"] as const;

async function ownClient(db: Db, orgId: string, id: string) {
  const [c] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .limit(1);
  return c ?? null;
}

const parseTags = (t: string): string[] => {
  try {
    return JSON.parse(t) as string[];
  } catch {
    return [];
  }
};

/** The light CRM: who looks after a client, what was said, and when to reach out next. */
export const crmApp = new Hono<Env>()
  .use(requireAuth)

  // A client's CRM card: the owner and labels, plus the log of contacts newest first.
  .get("/clients/:id", requirePerm("clients.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const client = await ownClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    const activities = await db
      .select()
      .from(crmActivities)
      .where(eq(crmActivities.clientId, client.id))
      .orderBy(desc(crmActivities.at), desc(crmActivities.createdAt))
      .limit(200);
    const [owner] = client.ownerId
      ? await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, client.ownerId))
          .limit(1)
      : [];
    const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
    const activeProjects = await n(
      db
        .select({ n: count() })
        .from(projects)
        .where(
          and(
            eq(projects.clientId, client.id),
            isNull(projects.archivedAt),
            eq(projects.status, "active"),
          ),
        ),
    );
    const completedProjects = await n(
      db
        .select({ n: count() })
        .from(projects)
        .where(
          and(
            eq(projects.clientId, client.id),
            isNull(projects.archivedAt),
            eq(projects.status, "completed"),
          ),
        ),
    );
    const openRequests = await n(
      db
        .select({ n: count() })
        .from(productRequests)
        .where(
          and(eq(productRequests.clientId, client.id), inArray(productRequests.status, [...OPEN])),
        ),
    );
    const openQuotes = await n(
      db
        .select({ n: count() })
        .from(quotes)
        .where(and(eq(quotes.clientId, client.id), inArray(quotes.status, ["draft", "sent"]))),
    );
    return c.json({
      ok: true,
      relationship: relationshipOf({
        activeProjects,
        completedProjects,
        openRequests,
        openQuotes,
        lastTouch: client.lastContactAt,
        createdAt: client.createdAt,
        now: nowSec(),
      }),
      crm: {
        ownerId: client.ownerId,
        ownerName: owner?.name ?? "",
        source: client.source,
        tags: parseTags(client.tags),
        nextFollowUpAt: client.nextFollowUpAt,
        lastContactAt: client.lastContactAt,
      },
      activities,
    });
  })

  .post(
    "/clients/:id/activities",
    requirePerm("clients.edit"),
    zValidator("json", activityInput),
    async (c) => {
      const me = c.get("user");
      const db = c.get("db");
      const client = await ownClient(db, me.orgId, c.req.param("id"));
      if (!client) return c.json({ ok: false, error: "not_found" }, 404);
      const v = c.req.valid("json");
      const at = v.on && v.on !== today() ? epochOf(v.on) : nowSec(); // today means now, never a future noon
      const id = newId("act");
      await db.insert(crmActivities).values({
        id,
        orgId: me.orgId,
        clientId: client.id,
        requestId: v.requestId,
        type: v.type,
        summary: v.summary,
        at,
        createdBy: me.id,
        createdByName: me.name,
      });
      // A contact is the latest one only if it is the newest; a back-dated entry must not rewind it.
      await db
        .update(clients)
        .set({
          lastContactAt: Math.max(client.lastContactAt, at),
          ...(v.followUpAt !== undefined ? { nextFollowUpAt: v.followUpAt } : {}),
          updatedAt: nowSec(),
        })
        .where(eq(clients.id, client.id));
      // A request tied to this contact moves with it: its own follow-up is the one just set.
      if (v.requestId && v.followUpAt !== undefined)
        await db
          .update(productRequests)
          .set({ followUpAt: v.followUpAt, updatedBy: me.id, updatedAt: nowSec() })
          .where(and(eq(productRequests.id, v.requestId), eq(productRequests.orgId, me.orgId)));
      return c.json({ ok: true, id }, 201);
    },
  )

  .delete("/activities/:id", requirePerm("clients.edit"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const [a] = await db
      .select()
      .from(crmActivities)
      .where(and(eq(crmActivities.id, c.req.param("id")), eq(crmActivities.orgId, me.orgId)))
      .limit(1);
    if (!a) return c.json({ ok: false, error: "not_found" }, 404);
    await db.delete(crmActivities).where(eq(crmActivities.id, a.id));
    // The client's last contact falls back to the newest entry that is left.
    const [latest] = await db
      .select({ at: crmActivities.at })
      .from(crmActivities)
      .where(eq(crmActivities.clientId, a.clientId))
      .orderBy(desc(crmActivities.at))
      .limit(1);
    await db
      .update(clients)
      .set({ lastContactAt: latest?.at ?? 0 })
      .where(eq(clients.id, a.clientId));
    return c.json({ ok: true });
  })

  .patch("/clients/:id", requirePerm("clients.edit"), zValidator("json", crmPatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const client = await ownClient(db, me.orgId, c.req.param("id"));
    if (!client) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    if (v.ownerId) {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, v.ownerId), eq(users.orgId, me.orgId), eq(users.active, true)))
        .limit(1);
      if (!u) return c.json({ ok: false, error: "owner_not_found" }, 404);
    }
    await db
      .update(clients)
      .set({
        ...(v.ownerId !== undefined ? { ownerId: v.ownerId } : {}),
        ...(v.source !== undefined ? { source: v.source } : {}),
        ...(v.tags !== undefined ? { tags: JSON.stringify(cleanTags(v.tags)) } : {}),
        ...(v.nextFollowUpAt !== undefined ? { nextFollowUpAt: v.nextFollowUpAt } : {}),
        updatedAt: nowSec(),
      })
      .where(eq(clients.id, client.id));
    if (v.ownerId && v.ownerId !== client.ownerId && v.ownerId !== me.id)
      await notify(db, me.orgId, [v.ownerId], {
        kind: "client",
        title: `أُسند إليك العميل: ${client.name}`,
        link: `/clients/${client.id}`,
        dedupeKey: `client:${client.id}:${v.ownerId}`,
      });
    return c.json({ ok: true });
  })

  // Every follow-up in one list: clients with a next-contact date, and enquiries with a follow-up date.
  .get("/followups", requirePerm("clients.view"), zValidator("query", followupQuery), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const { scope } = c.req.valid("query");
    const t = today();
    const cl = await db
      .select({
        id: clients.id,
        name: clients.name,
        phone: clients.phone,
        date: clients.nextFollowUpAt,
        ownerId: clients.ownerId,
        lastContactAt: clients.lastContactAt,
      })
      .from(clients)
      .where(
        and(
          eq(clients.orgId, me.orgId),
          isNull(clients.archivedAt),
          ne(clients.nextFollowUpAt, ""),
        ),
      )
      .orderBy(asc(clients.nextFollowUpAt));
    const rq = me.perms.includes("sales.view")
      ? await db
          .select({
            id: productRequests.id,
            name: productRequests.name,
            entity: productRequests.entity,
            phone: productRequests.phone,
            date: productRequests.followUpAt,
            ownerId: productRequests.ownerId,
            clientId: productRequests.clientId,
            valueHalalas: productRequests.valueHalalas,
          })
          .from(productRequests)
          .where(
            and(
              eq(productRequests.orgId, me.orgId),
              inArray(productRequests.status, [...OPEN]),
              ne(productRequests.followUpAt, ""),
            ),
          )
          .orderBy(asc(productRequests.followUpAt))
      : [];
    const owners = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.orgId, me.orgId));
    const nameOf = (id: string) => owners.find((o) => o.id === id)?.name ?? "";
    const items = [
      ...cl.map((x) => ({
        kind: "client" as const,
        id: x.id,
        title: x.name,
        subtitle: "",
        phone: x.phone,
        date: x.date,
        ownerId: x.ownerId,
        ownerName: nameOf(x.ownerId),
        link: `/clients/${x.id}`,
        value: 0,
        lastContactAt: x.lastContactAt,
      })),
      ...rq.map((x) => ({
        kind: "request" as const,
        id: x.id,
        title: x.name,
        subtitle: x.entity,
        phone: x.phone,
        date: x.date,
        ownerId: x.ownerId,
        ownerName: nameOf(x.ownerId),
        link: "/sales",
        value: x.valueHalalas / 100,
        lastContactAt: 0,
      })),
    ]
      .filter((i) => scope === "all" || i.ownerId === me.id)
      .map((i) => ({ ...i, state: followUpState(i.date, t) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return c.json({ ok: true, today: t, items });
  });
