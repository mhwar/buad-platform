import { aging, cashForecast, firstShortfall, fromRiyals } from "@buad/domain";
import {
  clients,
  financeEntries,
  paymentSchedule,
  projectReceipts,
  projects,
} from "@buad/schema/db";
import { receiveInput, scheduleInput, schedulePatch } from "@buad/schema/receivables";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";
import { loadVisible } from "./projects";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const today = () => new Date().toISOString().slice(0, 10);

async function line(db: Db, orgId: string, id: string) {
  const [r] = await db
    .select()
    .from(paymentSchedule)
    .where(and(eq(paymentSchedule.id, id), eq(paymentSchedule.orgId, orgId)))
    .limit(1);
  return r ?? null;
}

const shape = (r: typeof paymentSchedule.$inferSelect) => ({
  id: r.id,
  projectId: r.projectId,
  label: r.label,
  dueDate: r.dueDate,
  amount: r.amount / 100,
  status: r.status,
  receivedAt: r.receivedAt,
});

export const receivablesApp = new Hono<Env>()
  .use(requireAuth)

  // Everything still owed to the company, aged, with the next 13 weeks of cash.
  .get("/", requirePerm("treasury.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const t = today();
    const rows = await db
      .select({
        s: paymentSchedule,
        project: projects.name,
        client: clients.name,
        phone: clients.phone,
      })
      .from(paymentSchedule)
      .innerJoin(projects, eq(projects.id, paymentSchedule.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          eq(paymentSchedule.orgId, me.orgId),
          eq(paymentSchedule.status, "pending"),
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(asc(paymentSchedule.dueDate));
    const items = rows.map((r) => ({
      ...shape(r.s),
      project: r.project,
      client: r.client,
      phone: r.phone,
    }));
    const a = aging(
      rows.map((r) => ({ dueDate: r.s.dueDate, amount: r.s.amount })),
      t,
    );

    // Money going out: registered expenses not yet paid.
    const pend = await db
      .select({ date: financeEntries.date, amount: financeEntries.amount })
      .from(financeEntries)
      .innerJoin(projects, eq(projects.id, financeEntries.projectId))
      .where(
        and(
          eq(projects.orgId, me.orgId),
          eq(financeEntries.type, "expense"),
          eq(financeEntries.status, "pending"),
          isNull(projects.archivedAt),
        ),
      );
    const opening = Math.round(Number(c.req.query("opening") ?? 0) * 100) || 0;
    const weeks = cashForecast({
      today: t,
      opening,
      inflows: rows.map((r) => ({ date: r.s.dueDate, amount: r.s.amount })),
      outflows: pend.map((p) => ({ date: p.date, amount: p.amount })),
    });
    const short = firstShortfall(weeks);
    const money = (h: number) => h / 100;
    return c.json({
      ok: true,
      today: t,
      aging: {
        total: money(a.total),
        overdue: money(a.overdue),
        buckets: Object.fromEntries(
          Object.entries(a.buckets).map(([k, v]) => [
            k,
            { amount: money(v.amount), count: v.count },
          ]),
        ),
      },
      items,
      weeks: weeks.map((w) => ({
        ...w,
        inflow: money(w.inflow),
        outflow: money(w.outflow),
        net: money(w.net),
        balance: money(w.balance),
      })),
      shortfallWeek: short?.start ?? null,
      pendingExpenses: money(pend.reduce((s, p) => s + p.amount, 0)),
    });
  })

  // One project's schedule (for the project page).
  .get("/projects/:projectId", requirePerm("finance.view"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const p = await loadVisible(db, me, c.req.param("projectId"));
    if (!p) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(paymentSchedule)
      .where(eq(paymentSchedule.projectId, p.id))
      .orderBy(asc(paymentSchedule.dueDate));
    return c.json({ ok: true, items: rows.map(shape) });
  })

  .post(
    "/projects/:projectId",
    requirePerm("finance.edit"),
    zValidator("json", scheduleInput),
    async (c) => {
      const me = c.get("user");
      const db = c.get("db");
      const p = await loadVisible(db, me, c.req.param("projectId"));
      if (!p) return c.json({ ok: false, error: "not_found" }, 404);
      const v = c.req.valid("json");
      const id = newId("psc");
      await db.insert(paymentSchedule).values({
        id,
        orgId: me.orgId,
        projectId: p.id,
        label: v.label,
        dueDate: v.dueDate,
        amount: fromRiyals(v.amount),
        createdBy: me.id,
      });
      return c.json({ ok: true, id }, 201);
    },
  )

  .patch("/:id", requirePerm("finance.edit"), zValidator("json", schedulePatch), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await line(db, me.orgId, c.req.param("id"));
    if (!r || !(await loadVisible(db, me, r.projectId)))
      return c.json({ ok: false, error: "not_found" }, 404);
    if (r.status === "received") return c.json({ ok: false, error: "already_received" }, 409);
    const { amount, ...rest } = c.req.valid("json");
    await db
      .update(paymentSchedule)
      .set({ ...rest, ...(amount !== undefined ? { amount: fromRiyals(amount) } : {}) })
      .where(eq(paymentSchedule.id, r.id));
    return c.json({ ok: true });
  })

  .delete("/:id", requirePerm("finance.edit"), async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const r = await line(db, me.orgId, c.req.param("id"));
    if (!r || !(await loadVisible(db, me, r.projectId)))
      return c.json({ ok: false, error: "not_found" }, 404);
    if (r.status === "received") return c.json({ ok: false, error: "already_received" }, 409);
    await db.delete(paymentSchedule).where(eq(paymentSchedule.id, r.id));
    return c.json({ ok: true });
  })

  // The instalment arrived: it becomes a verified receipt on the project (so profit, VAT and the
  // quarter centre see it) and the line is closed. Both happen or neither.
  .post(
    "/:id/receive",
    requirePerm("finance.edit"),
    zValidator("json", receiveInput),
    async (c) => {
      const me = c.get("user");
      const db = c.get("db");
      const r = await line(db, me.orgId, c.req.param("id"));
      if (!r || !(await loadVisible(db, me, r.projectId)))
        return c.json({ ok: false, error: "not_found" }, 404);
      if (r.status !== "pending") return c.json({ ok: false, error: "not_pending" }, 409);
      const date = c.req.valid("json").date ?? today();
      const receiptId = newId("rcp");
      // Claim the line first: a double tap cannot create two receipts.
      const claimed = await db
        .update(paymentSchedule)
        .set({ status: "received", receiptId, receivedAt: date })
        .where(and(eq(paymentSchedule.id, r.id), eq(paymentSchedule.status, "pending")))
        .returning({ id: paymentSchedule.id });
      if (!claimed.length) return c.json({ ok: false, error: "not_pending" }, 409);
      await db.insert(projectReceipts).values({
        id: receiptId,
        orgId: me.orgId,
        projectId: r.projectId,
        date,
        amount: r.amount,
        note: r.label,
        basis: "من جدول الدفعات",
        approvedBy: me.id,
        approvedAt: nowSec(),
        createdBy: me.id,
        updatedBy: me.id,
      });
      return c.json({ ok: true, receiptId });
    },
  );
