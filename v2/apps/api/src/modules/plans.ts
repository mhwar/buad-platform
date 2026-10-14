import {
  attainment,
  cycleProgress,
  isMetric,
  metricOf,
  objectiveProgress,
  type PlatformMetric,
  planStatus,
  yearQuarterRange,
} from "@buad/domain";
import {
  clients,
  planCycles,
  planIndicators,
  planInitiatives,
  planObjectives,
  planReviews,
  productRequests,
  projects,
  users,
} from "@buad/schema/db";
import {
  cycleCreate,
  cyclePatch,
  indicatorInput,
  indicatorPatch,
  initiativeInput,
  initiativePatch,
  objectiveInput,
  objectivePatch,
  reviewInput,
} from "@buad/schema/plans";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { contractTotalSql, newId, nowSec } from "./common";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const today = () => new Date().toISOString().slice(0, 10);
const epoch = (d: string, end = false) =>
  Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000) + (end ? 86399 : 0);
const parse = <T>(t: string, f: T): T => {
  try {
    return JSON.parse(t) as T;
  } catch {
    return f;
  }
};

/** A platform number over a date window (inclusive). Money in riyals. */
export async function platformMetric(
  db: Db,
  orgId: string,
  metric: PlatformMetric,
  start: string,
  end: string,
): Promise<number> {
  const live = and(eq(projects.orgId, orgId), isNull(projects.archivedAt));
  const count = async (
    w: ReturnType<typeof and>,
    table: typeof projects | typeof clients | typeof productRequests,
  ) => Number((await db.select({ n: sql<number>`count(*)` }).from(table).where(w))[0]?.n ?? 0);
  const requests = (extra?: ReturnType<typeof eq>) =>
    count(
      and(
        eq(productRequests.orgId, orgId),
        gte(productRequests.createdAt, epoch(start)),
        lte(productRequests.createdAt, epoch(end, true)),
        extra,
      ),
      productRequests,
    );
  switch (metric) {
    case "contracts": {
      const row = (await db.get(sql`
        SELECT COALESCE(SUM(${contractTotalSql("p")}), 0) AS v FROM projects p
        WHERE p.org_id = ${orgId} AND p.archived_at IS NULL AND p.status IN ('active','completed','paused')
          AND p.start_date >= ${start} AND p.start_date <= ${end}`)) as { v: number } | undefined;
      return Math.round(Number(row?.v ?? 0)) / 100;
    }
    case "projects_started":
      return count(
        and(
          live,
          gte(projects.startDate, start),
          lte(projects.startDate, end),
          sql`${projects.startDate} <> ''`,
        ),
        projects,
      );
    case "projects_completed":
      return count(
        and(
          live,
          eq(projects.status, "completed"),
          gte(projects.endDate, start),
          lte(projects.endDate, end),
        ),
        projects,
      );
    case "clients_new":
      return count(
        and(
          eq(clients.orgId, orgId),
          isNull(clients.archivedAt),
          gte(clients.createdAt, epoch(start)),
          lte(clients.createdAt, epoch(end, true)),
        ),
        clients,
      );
    case "requests":
      return requests();
    case "requests_won":
      return requests(eq(productRequests.status, "won"));
    case "conversion": {
      const all = await requests();
      return all
        ? Math.round(((await requests(eq(productRequests.status, "won"))) / all) * 1000) / 10
        : 0;
    }
  }
}

const windowOf = (cycle: { startDate: string; endDate: string }, quarter: number) => {
  if (quarter >= 1 && quarter <= 4 && cycle.startDate) {
    const r = yearQuarterRange(Number(cycle.startDate.slice(0, 4)), quarter);
    return r;
  }
  return { start: cycle.startDate || "1970-01-01", end: cycle.endDate || "2999-12-31" };
};

/** One cycle with everything under it and the progress worked out. */
async function loadCycle(db: Db, orgId: string, id: string) {
  const [cycle] = await db
    .select()
    .from(planCycles)
    .where(and(eq(planCycles.id, id), eq(planCycles.orgId, orgId)))
    .limit(1);
  if (!cycle) return null;
  const objs = await db
    .select()
    .from(planObjectives)
    .where(eq(planObjectives.cycleId, id))
    .orderBy(asc(planObjectives.quarter), asc(planObjectives.sort), asc(planObjectives.title));
  const ids = objs.map((o) => o.id);
  const inds = ids.length
    ? await db.select().from(planIndicators).where(inArray(planIndicators.objectiveId, ids))
    : [];
  const inits = ids.length
    ? await db.select().from(planInitiatives).where(inArray(planInitiatives.objectiveId, ids))
    : [];
  const revs = ids.length
    ? await db
        .select()
        .from(planReviews)
        .where(inArray(planReviews.objectiveId, ids))
        .orderBy(desc(planReviews.createdAt))
    : [];
  const t = today();
  const objectives = [];
  for (const o of objs) {
    const win = windowOf(cycle, o.quarter);
    const indicators = [];
    for (const i of inds.filter((x) => x.objectiveId === o.id)) {
      const m = metricOf(i.source);
      const current =
        m && isMetric(m) ? await platformMetric(db, orgId, m, win.start, win.end) : i.current;
      indicators.push({ ...i, current, attainment: attainment({ ...i, current }) });
    }
    const initiatives = inits.filter((x) => x.objectiveId === o.id);
    const progress = objectiveProgress(indicators, initiatives);
    objectives.push({
      ...o,
      budget: o.budgetHalalas / 100,
      indicators,
      initiatives: initiatives.map((i) => ({ ...i, budget: i.budgetHalalas / 100 })),
      reviews: revs
        .filter((r) => r.objectiveId === o.id)
        .map((r) => ({ ...r, snapshot: parse(r.snapshot, {}) })),
      progress,
      status: planStatus(progress, win.start, win.end, t),
    });
  }
  const progress = cycleProgress(objectives);
  return {
    cycle: { ...cycle, values: parse<string[]>(cycle.values, []) },
    objectives,
    progress,
    status: planStatus(progress, cycle.startDate, cycle.endDate, t),
    budget: objectives.reduce((s, o) => s + o.budget, 0),
  };
}

async function ownObjective(db: Db, orgId: string, id: string) {
  const [o] = await db
    .select()
    .from(planObjectives)
    .where(and(eq(planObjectives.id, id), eq(planObjectives.orgId, orgId)))
    .limit(1);
  return o ?? null;
}

const bad = (c: { json: (b: unknown, s: 400) => Response }, error: string) =>
  c.json({ ok: false, error }, 400);

export const plansApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("plans.view", "plans.edit"))

  .get("/metrics", async (c) => {
    const me = c.get("user");
    const start = c.req.query("start") ?? "";
    const end = c.req.query("end") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
      return bad(c, "bad_range");
    const out: Record<string, number> = {};
    for (const k of [
      "contracts",
      "projects_started",
      "projects_completed",
      "clients_new",
      "requests",
      "requests_won",
      "conversion",
    ] as const)
      out[k] = await platformMetric(c.get("db"), me.orgId, k, start, end);
    return c.json({ ok: true, metrics: out });
  })

  .get("/cycles", async (c) => {
    const me = c.get("user");
    const rows = await c
      .get("db")
      .select()
      .from(planCycles)
      .where(eq(planCycles.orgId, me.orgId))
      .orderBy(desc(planCycles.startDate), desc(planCycles.createdAt));
    return c.json({
      ok: true,
      cycles: rows.map((r) => ({ ...r, values: parse<string[]>(r.values, []) })),
    });
  })

  .post("/cycles", zValidator("json", cycleCreate), async (c) => {
    const me = c.get("user");
    const v = c.req.valid("json");
    if (v.startDate && v.endDate && v.endDate < v.startDate) return bad(c, "end_before_start");
    if (v.parentCycleId) {
      const [p] = await c
        .get("db")
        .select({ id: planCycles.id })
        .from(planCycles)
        .where(
          and(
            eq(planCycles.id, v.parentCycleId),
            eq(planCycles.orgId, me.orgId),
            eq(planCycles.kind, "strategic"),
          ),
        )
        .limit(1);
      if (!p) return c.json({ ok: false, error: "parent_not_found" }, 404);
    }
    const id = newId("pcy");
    await c
      .get("db")
      .insert(planCycles)
      .values({ id, orgId: me.orgId, ...v, createdBy: me.id });
    return c.json({ ok: true, id }, 201);
  })

  .get("/cycles/:id", async (c) => {
    const data = await loadCycle(c.get("db"), c.get("user").orgId, c.req.param("id"));
    if (!data) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...data });
  })

  .patch("/cycles/:id", zValidator("json", cyclePatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const { version, values, ...rest } = c.req.valid("json");
    const [cur] = await db
      .select()
      .from(planCycles)
      .where(and(eq(planCycles.id, c.req.param("id")), eq(planCycles.orgId, me.orgId)))
      .limit(1);
    if (!cur) return c.json({ ok: false, error: "not_found" }, 404);
    if (version !== cur.version) return c.json({ ok: false, error: "version_conflict" }, 409);
    const s = rest.startDate ?? cur.startDate;
    const e = rest.endDate ?? cur.endDate;
    if (s && e && e < s) return bad(c, "end_before_start");
    await db
      .update(planCycles)
      .set({
        ...rest,
        ...(values ? { values: JSON.stringify(values) } : {}),
        version: cur.version + 1,
        updatedAt: nowSec(),
      })
      .where(eq(planCycles.id, cur.id));
    return c.json({ ok: true, version: cur.version + 1 });
  })

  .delete("/cycles/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const id = c.req.param("id");
    const [cur] = await db
      .select({ id: planCycles.id })
      .from(planCycles)
      .where(and(eq(planCycles.id, id), eq(planCycles.orgId, me.orgId)))
      .limit(1);
    if (!cur) return c.json({ ok: false, error: "not_found" }, 404);
    const [child] = await db
      .select({ id: planCycles.id })
      .from(planCycles)
      .where(and(eq(planCycles.parentCycleId, id), eq(planCycles.orgId, me.orgId)))
      .limit(1);
    if (child) return c.json({ ok: false, error: "has_children" }, 409);
    await db.delete(planCycles).where(eq(planCycles.id, id));
    return c.json({ ok: true });
  })

  // ─── objectives ──────────────────────────────────────────────────────────
  .post("/objectives", zValidator("json", objectiveInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const { budget, ...v } = c.req.valid("json");
    const [cycle] = await db
      .select()
      .from(planCycles)
      .where(and(eq(planCycles.id, v.cycleId), eq(planCycles.orgId, me.orgId)))
      .limit(1);
    if (!cycle) return c.json({ ok: false, error: "not_found" }, 404);
    if (v.parentId) {
      const parent = await ownObjective(db, me.orgId, v.parentId);
      if (!parent) return c.json({ ok: false, error: "parent_not_found" }, 404);
    }
    const id = newId("pob");
    await db
      .insert(planObjectives)
      .values({ id, orgId: me.orgId, ...v, budgetHalalas: Math.round(budget * 100) });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/objectives/:id", zValidator("json", objectivePatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const o = await ownObjective(db, me.orgId, c.req.param("id"));
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const { budget, ...rest } = c.req.valid("json");
    if (rest.parentId) {
      const parent = await ownObjective(db, me.orgId, rest.parentId);
      if (!parent) return c.json({ ok: false, error: "parent_not_found" }, 404);
    }
    await db
      .update(planObjectives)
      .set({
        ...rest,
        ...(budget !== undefined ? { budgetHalalas: Math.round(budget * 100) } : {}),
        updatedAt: nowSec(),
      })
      .where(eq(planObjectives.id, o.id));
    return c.json({ ok: true });
  })

  .delete("/objectives/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const o = await ownObjective(db, me.orgId, c.req.param("id"));
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    // Operational objectives that served this one keep existing, unlinked.
    await db
      .update(planObjectives)
      .set({ parentId: "" })
      .where(and(eq(planObjectives.parentId, o.id), eq(planObjectives.orgId, me.orgId)));
    await db.delete(planObjectives).where(eq(planObjectives.id, o.id));
    return c.json({ ok: true });
  })

  // ─── indicators ──────────────────────────────────────────────────────────
  .post("/objectives/:id/indicators", zValidator("json", indicatorInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const o = await ownObjective(db, me.orgId, c.req.param("id"));
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    if (v.source !== "manual" && !isMetric(metricOf(v.source))) return bad(c, "unknown_metric");
    const id = newId("pin");
    await db.insert(planIndicators).values({ id, orgId: me.orgId, objectiveId: o.id, ...v });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/indicators/:id", zValidator("json", indicatorPatch), async (c) => {
    const me = c.get("user");
    const v = c.req.valid("json");
    if (v.source && v.source !== "manual" && !isMetric(metricOf(v.source)))
      return bad(c, "unknown_metric");
    const r = await c
      .get("db")
      .update(planIndicators)
      .set(v)
      .where(and(eq(planIndicators.id, c.req.param("id")), eq(planIndicators.orgId, me.orgId)))
      .returning({ id: planIndicators.id });
    return r.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  .delete("/indicators/:id", async (c) => {
    const r = await c
      .get("db")
      .delete(planIndicators)
      .where(
        and(
          eq(planIndicators.id, c.req.param("id")),
          eq(planIndicators.orgId, c.get("user").orgId),
        ),
      )
      .returning({ id: planIndicators.id });
    return r.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  // ─── initiatives ─────────────────────────────────────────────────────────
  .post("/objectives/:id/initiatives", zValidator("json", initiativeInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const o = await ownObjective(db, me.orgId, c.req.param("id"));
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const { budget, ...v } = c.req.valid("json");
    if (v.dueDate && v.startDate && v.dueDate < v.startDate) return bad(c, "end_before_start");
    const id = newId("pit");
    await db.insert(planInitiatives).values({
      id,
      orgId: me.orgId,
      objectiveId: o.id,
      ...v,
      budgetHalalas: Math.round(budget * 100),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/initiatives/:id", zValidator("json", initiativePatch), async (c) => {
    const me = c.get("user");
    const { budget, ...v } = c.req.valid("json");
    const r = await c
      .get("db")
      .update(planInitiatives)
      .set({ ...v, ...(budget !== undefined ? { budgetHalalas: Math.round(budget * 100) } : {}) })
      .where(and(eq(planInitiatives.id, c.req.param("id")), eq(planInitiatives.orgId, me.orgId)))
      .returning({ id: planInitiatives.id });
    return r.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  .delete("/initiatives/:id", async (c) => {
    const r = await c
      .get("db")
      .delete(planInitiatives)
      .where(
        and(
          eq(planInitiatives.id, c.req.param("id")),
          eq(planInitiatives.orgId, c.get("user").orgId),
        ),
      )
      .returning({ id: planInitiatives.id });
    return r.length ? c.json({ ok: true }) : c.json({ ok: false, error: "not_found" }, 404);
  })

  // ─── reviews: a note plus the numbers as they stood ──────────────────────
  .post("/objectives/:id/reviews", zValidator("json", reviewInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const o = await ownObjective(db, me.orgId, c.req.param("id"));
    if (!o) return c.json({ ok: false, error: "not_found" }, 404);
    const data = await loadCycle(db, me.orgId, o.cycleId);
    const obj = data?.objectives.find((x) => x.id === o.id);
    const v = c.req.valid("json");
    const id = newId("prv");
    await db.insert(planReviews).values({
      id,
      orgId: me.orgId,
      objectiveId: o.id,
      quarter: v.quarter,
      note: v.note,
      createdBy: me.id,
      snapshot: JSON.stringify({
        progress: obj?.progress ?? null,
        status: obj?.status ?? "no_data",
        indicators:
          obj?.indicators.map((i) => ({
            name: i.name,
            current: i.current,
            target: i.target,
            unit: i.unit,
          })) ?? [],
        initiatives: obj?.initiatives.map((i) => ({ title: i.title, status: i.status })) ?? [],
      }),
    });
    return c.json({ ok: true, id }, 201);
  })

  .get("/owners", async (c) => {
    const rows = await c
      .get("db")
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.orgId, c.get("user").orgId), eq(users.active, true)));
    return c.json({ ok: true, owners: rows });
  });
