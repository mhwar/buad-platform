import { projects, tasks, timeEntries, users } from "@buad/schema/db";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import { visibleProjects } from "./projects";

/** «التقارير»: reports that read across modules (each checks its own permission). */
type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const day = /^\d{4}-\d{2}-\d{2}$/;

export const reportsApp = new Hono<Env>()
  .use(requireAuth)

  // Execution and productivity: per person and per project — open, late, done in the period, hours.
  .get("/execution", requirePerm("tasks.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const today = new Date().toISOString().slice(0, 10);
    const from = day.test(c.req.query("from") ?? "")
      ? (c.req.query("from") as string)
      : "1970-01-01";
    const to = day.test(c.req.query("to") ?? "") ? (c.req.query("to") as string) : "2999-12-31";
    const fromEpoch = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000);
    const toEpoch = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000);
    const vis = visibleProjects(me);
    // Tasks on projects this person sees, or company-level ones (as the tasks page does).
    const seen = sql`(${tasks.projectId} = '' OR ${tasks.projectId} IN (SELECT id FROM projects WHERE ${vis.sqlFor("projects")}))`;
    const rows = await db
      .select({
        assigneeId: tasks.assigneeId,
        projectId: tasks.projectId,
        open: sql<number>`SUM(CASE WHEN ${tasks.status} <> 'done' THEN 1 ELSE 0 END)`,
        late: sql<number>`SUM(CASE WHEN ${tasks.status} <> 'done' AND ${tasks.dueDate} <> '' AND ${tasks.dueDate} < ${today} THEN 1 ELSE 0 END)`,
        done: sql<number>`SUM(CASE WHEN ${tasks.status} = 'done' AND ${tasks.doneAt} >= ${fromEpoch} AND ${tasks.doneAt} <= ${toEpoch} THEN 1 ELSE 0 END)`,
        doneOnTime: sql<number>`SUM(CASE WHEN ${tasks.status} = 'done' AND ${tasks.doneAt} >= ${fromEpoch} AND ${tasks.doneAt} <= ${toEpoch}
          AND (${tasks.dueDate} = '' OR date(${tasks.doneAt}, 'unixepoch') <= ${tasks.dueDate}) THEN 1 ELSE 0 END)`,
      })
      .from(tasks)
      .where(and(eq(tasks.orgId, me.orgId), seen))
      .groupBy(tasks.assigneeId, tasks.projectId);
    const minutes = await db
      .select({
        userId: timeEntries.userId,
        projectId: timeEntries.projectId,
        m: sql<number>`SUM(${timeEntries.minutes})`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.orgId, me.orgId),
          gte(timeEntries.date, from),
          lte(timeEntries.date, to),
        ),
      )
      .groupBy(timeEntries.userId, timeEntries.projectId);
    const people = new Map(
      (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.orgId, me.orgId))
      ).map((u) => [u.id, u.name]),
    );
    const projNames = new Map(
      (
        await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(eq(projects.orgId, me.orgId), isNull(projects.archivedAt), vis.where))
      ).map((p) => [p.id, p.name]),
    );
    type Line = {
      key: string;
      name: string;
      open: number;
      late: number;
      done: number;
      onTime: number;
      minutes: number;
    };
    const add = (m: Map<string, Line>, key: string, name: string, r: Partial<Line>) => {
      const cur = m.get(key) ?? { key, name, open: 0, late: 0, done: 0, onTime: 0, minutes: 0 };
      for (const k of ["open", "late", "done", "onTime", "minutes"] as const)
        cur[k] += Number(r[k] ?? 0);
      m.set(key, cur);
    };
    const byPerson = new Map<string, Line>();
    const byProject = new Map<string, Line>();
    for (const r of rows) {
      const v = { open: r.open, late: r.late, done: r.done, onTime: r.doneOnTime };
      add(byPerson, r.assigneeId, people.get(r.assigneeId) || "بلا مسؤول", v);
      if (!r.projectId || projNames.has(r.projectId))
        add(
          byProject,
          r.projectId,
          r.projectId ? (projNames.get(r.projectId) ?? "") : "عمل الشركة",
          v,
        );
    }
    for (const t of minutes) {
      add(byPerson, t.userId, people.get(t.userId) || "—", { minutes: t.m });
      if (!t.projectId || projNames.has(t.projectId))
        add(
          byProject,
          t.projectId,
          t.projectId ? (projNames.get(t.projectId) ?? "") : "عمل الشركة",
          { minutes: t.m },
        );
    }
    const sort = (m: Map<string, Line>) =>
      [...m.values()].sort(
        (a, b) => b.late - a.late || b.open - a.open || a.name.localeCompare(b.name),
      );
    const all = sort(byPerson);
    return c.json({
      ok: true,
      period: { from, to },
      totals: all.reduce(
        (s, l) => ({
          open: s.open + l.open,
          late: s.late + l.late,
          done: s.done + l.done,
          onTime: s.onTime + l.onTime,
          minutes: s.minutes + l.minutes,
        }),
        { open: 0, late: 0, done: 0, onTime: 0, minutes: 0 },
      ),
      people: all,
      projects: sort(byProject),
    });
  });
