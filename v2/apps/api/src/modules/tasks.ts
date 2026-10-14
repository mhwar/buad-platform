import { products, projectStages, projects, tasks, timeEntries, users } from "@buad/schema/db";
import { productContent } from "@buad/schema/products";
import {
  stageInput,
  stagePatch,
  taskInput,
  taskPatch,
  taskQuery,
  timeInput,
} from "@buad/schema/tasks";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { notify } from "./notifications";
import { loadVisible, visibleProjects } from "./projects";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const today = () => new Date().toISOString().slice(0, 10);

async function activeUser(db: Db, orgId: string, id: string) {
  if (!id) return true;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId), eq(users.active, true)))
    .limit(1);
  return !!u;
}

/** A task the person may see: on a visible project, company-level, or assigned to them. */
async function loadTask(db: Db, me: Vars["user"], id: string) {
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.orgId, me.orgId)))
    .limit(1);
  if (!t) return null;
  if (t.projectId && t.assigneeId !== me.id && !(await loadVisible(db, me, t.projectId)))
    return null;
  return t;
}

const link = (t: { projectId: string }) =>
  t.projectId ? `/projects/${t.projectId}?view=execution` : "/more/tasks";

export const tasksApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("tasks.view", "tasks.edit"))

  .get("/assignees", async (c) => {
    const rows = await c
      .get("db")
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.orgId, c.get("user").orgId), eq(users.active, true)));
    return c.json({ ok: true, users: rows });
  })

  .get("/", zValidator("query", taskQuery), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const q = c.req.valid("query");
    const vis = visibleProjects(me);
    const rows = await db
      .select({
        t: tasks,
        projectName: projects.name,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(
        and(
          eq(tasks.orgId, me.orgId),
          // company-level tasks, tasks on projects the person sees, or assigned to them
          or(
            eq(tasks.projectId, ""),
            eq(tasks.assigneeId, me.id),
            vis.where
              ? sql`${tasks.projectId} IN (SELECT id FROM projects WHERE ${vis.sqlFor("projects")})`
              : sql`1 = 1`,
          ),
          q.mine ? eq(tasks.assigneeId, me.id) : undefined,
          q.project ? eq(tasks.projectId, q.project) : undefined,
          q.status ? eq(tasks.status, q.status) : undefined,
          q.assignee ? eq(tasks.assigneeId, q.assignee) : undefined,
          q.overdue
            ? and(
                ne(tasks.status, "done"),
                ne(tasks.dueDate, ""),
                sql`${tasks.dueDate} < ${today()}`,
              )
            : undefined,
        ),
      )
      .orderBy(
        asc(sql`CASE ${tasks.status} WHEN 'done' THEN 1 ELSE 0 END`),
        asc(sql`CASE WHEN ${tasks.dueDate} = '' THEN 1 ELSE 0 END`),
        asc(tasks.dueDate),
        desc(tasks.createdAt),
      )
      .limit(300);
    return c.json({
      ok: true,
      items: rows.map((r) => ({
        ...r.t,
        projectName: r.projectName ?? "",
        assigneeName: r.assigneeName ?? "",
      })),
    });
  })

  .post("/", zValidator("json", taskInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const v = c.req.valid("json");
    if (v.projectId && !(await loadVisible(db, me, v.projectId)))
      return c.json({ ok: false, error: "project_not_found" }, 404);
    if (!(await activeUser(db, me.orgId, v.assigneeId)))
      return c.json({ ok: false, error: "assignee_not_found" }, 404);
    if (v.dueDate && v.startDate && v.dueDate < v.startDate)
      return c.json({ ok: false, error: "end_before_start" }, 400);
    const id = newId("tsk");
    await db.insert(tasks).values({
      id,
      orgId: me.orgId,
      ...v,
      createdBy: me.id,
      doneAt: v.status === "done" ? nowSec() : 0,
    });
    if (v.assigneeId && v.assigneeId !== me.id)
      await notify(db, me.orgId, [v.assigneeId], {
        kind: "task",
        title: `أُسندت إليك مهمة: ${v.title}`,
        link: link(v),
        dedupeKey: `task:${id}:${v.assigneeId}`,
      });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:id", zValidator("json", taskPatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const t = await loadTask(db, me, c.req.param("id"));
    if (!t) return c.json({ ok: false, error: "not_found" }, 404);
    const v = c.req.valid("json");
    if (v.projectId && v.projectId !== t.projectId && !(await loadVisible(db, me, v.projectId)))
      return c.json({ ok: false, error: "project_not_found" }, 404);
    if (v.assigneeId !== undefined && !(await activeUser(db, me.orgId, v.assigneeId)))
      return c.json({ ok: false, error: "assignee_not_found" }, 404);
    const start = v.startDate ?? t.startDate;
    const due = v.dueDate ?? t.dueDate;
    if (start && due && due < start) return c.json({ ok: false, error: "end_before_start" }, 400);
    const set: Partial<typeof tasks.$inferInsert> = { ...v, updatedAt: nowSec() };
    if (v.status && v.status !== t.status) set.doneAt = v.status === "done" ? nowSec() : 0;
    await db.update(tasks).set(set).where(eq(tasks.id, t.id));
    if (v.assigneeId && v.assigneeId !== t.assigneeId && v.assigneeId !== me.id)
      await notify(db, me.orgId, [v.assigneeId], {
        kind: "task",
        title: `أُسندت إليك مهمة: ${v.title ?? t.title}`,
        link: link({ projectId: v.projectId ?? t.projectId }),
        dedupeKey: `task:${t.id}:${v.assigneeId}`,
      });
    return c.json({ ok: true });
  })

  .delete("/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const t = await loadTask(db, me, c.req.param("id"));
    if (!t) return c.json({ ok: false, error: "not_found" }, 404);
    await db.delete(tasks).where(eq(tasks.id, t.id));
    return c.json({ ok: true });
  })

  // ─── time ────────────────────────────────────────────────────────────────
  .post("/:id/time", zValidator("json", timeInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const t = await loadTask(db, me, c.req.param("id"));
    if (!t) return c.json({ ok: false, error: "not_found" }, 404);
    const id = newId("tim");
    await db.insert(timeEntries).values({
      id,
      orgId: me.orgId,
      taskId: t.id,
      projectId: t.projectId,
      userId: me.id,
      ...c.req.valid("json"),
    });
    return c.json({ ok: true, id }, 201);
  })

  // ─── a project's execution: stages, tasks and hours ──────────────────────
  .get("/projects/:projectId", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const p = await loadVisible(db, me, c.req.param("projectId"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const stages = await db
      .select()
      .from(projectStages)
      .where(eq(projectStages.projectId, p.id))
      .orderBy(asc(projectStages.sort), asc(projectStages.title));
    const list = await db
      .select({ t: tasks, assigneeName: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.orgId, me.orgId), eq(tasks.projectId, p.id)))
      .orderBy(asc(sql`CASE ${tasks.status} WHEN 'done' THEN 1 ELSE 0 END`), asc(tasks.dueDate));
    const minutes = Number(
      (
        await db
          .select({ m: sql<number>`COALESCE(SUM(${timeEntries.minutes}), 0)` })
          .from(timeEntries)
          .where(eq(timeEntries.projectId, p.id))
      )[0]?.m ?? 0,
    );
    let hasService = false;
    if (p.productId)
      hasService = !!(
        await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, p.productId), eq(products.orgId, me.orgId)))
          .limit(1)
      )[0];
    return c.json({
      ok: true,
      stages,
      tasks: list.map((r) => ({ ...r.t, assigneeName: r.assigneeName ?? "" })),
      minutes,
      hasService,
    });
  })

  .post("/projects/:projectId/stages", zValidator("json", stageInput), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const p = await loadVisible(db, me, c.req.param("projectId"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const sort =
      Number(
        (
          await db
            .select({ m: sql<number>`COALESCE(MAX(${projectStages.sort}), 0)` })
            .from(projectStages)
            .where(eq(projectStages.projectId, p.id))
        )[0]?.m ?? 0,
      ) + 1;
    const id = newId("stg");
    await db
      .insert(projectStages)
      .values({ id, orgId: me.orgId, projectId: p.id, sort, ...c.req.valid("json") });
    return c.json({ ok: true, id }, 201);
  })

  // Copies the steps of the linked service's workflow («آلية العمل») once, when there are no stages yet.
  .post("/projects/:projectId/stages/from-service", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const p = await loadVisible(db, me, c.req.param("projectId"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    if (!p.productId) return c.json({ ok: false, error: "no_service" }, 409);
    const existing = await db
      .select({ id: projectStages.id })
      .from(projectStages)
      .where(eq(projectStages.projectId, p.id))
      .limit(1);
    if (existing.length) return c.json({ ok: false, error: "has_stages" }, 409);
    const [prod] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, p.productId), eq(products.orgId, me.orgId)))
      .limit(1);
    if (!prod) return c.json({ ok: false, error: "no_service" }, 409);
    let steps: string[] = [];
    try {
      steps = productContent
        .parse(JSON.parse(prod.content))
        .process.map((s) => s.title)
        .filter(Boolean);
    } catch {
      steps = [];
    }
    if (!steps.length) return c.json({ ok: false, error: "no_steps" }, 409);
    await db.insert(projectStages).values(
      steps.map((title, i) => ({
        id: newId("stg"),
        orgId: me.orgId,
        projectId: p.id,
        title,
        sort: i + 1,
        source: "product" as const,
      })),
    );
    return c.json({ ok: true, count: steps.length }, 201);
  })

  .patch("/stages/:id", zValidator("json", stagePatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const [s] = await db
      .select()
      .from(projectStages)
      .where(and(eq(projectStages.id, c.req.param("id")), eq(projectStages.orgId, me.orgId)))
      .limit(1);
    if (!s || !(await loadVisible(db, me, s.projectId)))
      return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(projectStages).set(c.req.valid("json")).where(eq(projectStages.id, s.id));
    return c.json({ ok: true });
  })

  .delete("/stages/:id", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const [s] = await db
      .select()
      .from(projectStages)
      .where(and(eq(projectStages.id, c.req.param("id")), eq(projectStages.orgId, me.orgId)))
      .limit(1);
    if (!s || !(await loadVisible(db, me, s.projectId)))
      return c.json({ ok: false, error: "not_found" }, 404);
    await db.update(tasks).set({ stageId: "" }).where(eq(tasks.stageId, s.id));
    await db.delete(projectStages).where(eq(projectStages.id, s.id));
    return c.json({ ok: true });
  });
