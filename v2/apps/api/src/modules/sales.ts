import {
  avgCycleDays,
  bySource,
  followUpState,
  isStale,
  type Lead,
  monthlyWon,
  OPEN_STAGES,
  pipelineStats,
  quoteStats,
  quoteTotals,
  winRate,
  wonThisQuarter,
} from "@buad/domain";
import { clients, productRequests, quotes } from "@buad/schema/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import { contractTotalSql, nowSec } from "./common";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };
const money = (h: number) => h / 100;
const today = () => new Date().toISOString().slice(0, 10);

/** The numbers behind the sales dashboard, computed when asked from the live records. */
export const salesApp = new Hono<Env>()
  .use(requireAuth)
  .use(requirePerm("sales.view"))
  .get("/overview", async (c) => {
    const me = c.get("user");
    const db = c.get("db");
    const now = nowSec();
    const t = today();

    const reqs = await db.select().from(productRequests).where(eq(productRequests.orgId, me.orgId));
    // Where a lead came from: the client's recorded source when it has one, else how it arrived.
    const clientSource = new Map(
      (
        await db
          .select({ id: clients.id, source: clients.source })
          .from(clients)
          .where(eq(clients.orgId, me.orgId))
      ).map((x) => [x.id, x.source]),
    );
    const leads: (Lead & {
      id: string;
      name: string;
      entity: string;
      ownerId: string;
      followUpAt: string;
      clientId: string;
    })[] = reqs.map((r) => ({
      id: r.id,
      name: r.name,
      entity: r.entity,
      ownerId: r.ownerId,
      followUpAt: r.followUpAt,
      clientId: r.clientId,
      status: r.status,
      valueHalalas: r.valueHalalas,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      source:
        (r.clientId && clientSource.get(r.clientId)) || (r.source === "site" ? "site" : "other"),
    }));

    const pipe = pipelineStats(leads);
    // An optional period (?from&to) narrows the results and sources to leads that arrived in it;
    // the open pipeline is always as it stands today.
    const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("from") ?? "") ? c.req.query("from") : "";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("to") ?? "") ? c.req.query("to") : "";
    const inPeriod = (l: { createdAt: number }) => {
      const d = new Date(l.createdAt * 1000).toISOString().slice(0, 10);
      return (!from || d >= from) && (!to || d <= to);
    };
    const period = leads.filter(inPeriod);
    const won = period.filter((l) => l.status === "won");
    const lost = period.filter((l) => l.status === "lost");
    const stale = leads
      .filter((l) => isStale(l, now))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, 6)
      .map((l) => ({
        id: l.id,
        name: l.name,
        entity: l.entity,
        status: l.status,
        value: money(l.valueHalalas),
        daysIdle: Math.floor((now - l.updatedAt) / 86400),
      }));

    const due = leads.filter(
      (l) =>
        (OPEN_STAGES as readonly string[]).includes(l.status) &&
        ["overdue", "today"].includes(followUpState(l.followUpAt, t)),
    ).length;
    const clientsDue = Number(
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(clients)
          .where(
            and(
              eq(clients.orgId, me.orgId),
              isNull(clients.archivedAt),
              ne(clients.nextFollowUpAt, ""),
              sql`${clients.nextFollowUpAt} <= ${t}`,
            ),
          )
      )[0]?.n ?? 0,
    );

    // Quotes: how many went out and how they ended, by count and by value.
    const qs = await db.select().from(quotes).where(eq(quotes.orgId, me.orgId));
    const total = (q: (typeof qs)[number]) => {
      try {
        return quoteTotals(JSON.parse(q.items), q.discountHalalas, q.vatPct).total;
      } catch {
        return 0;
      }
    };
    const facts = qs.map((q) => ({
      id: q.id,
      status: q.status,
      total: total(q),
      validUntil: q.validUntil,
      updatedAt: q.updatedAt,
    }));
    const qstat = quoteStats(facts, t, now);
    const byId = new Map(qs.map((q) => [q.id, q]));
    const brief = (f: { id: string }) => {
      const q = byId.get(f.id);
      return {
        id: f.id,
        number: q?.number ?? "",
        title: q?.title ?? "",
        recipient: q?.recipient ?? "",
        total: money(total(q as (typeof qs)[number])),
      };
    };

    const topClients = await db
      .select({
        id: clients.id,
        name: clients.name,
        value: sql<number>`(SELECT coalesce(sum(${contractTotalSql("p")}), 0) FROM projects p WHERE p.client_id = "clients"."id" AND p.archived_at IS NULL AND p.status IN ('active','completed'))`,
      })
      .from(clients)
      .where(and(eq(clients.orgId, me.orgId), isNull(clients.archivedAt)))
      .orderBy(sql`3 DESC`)
      .limit(5);

    return c.json({
      ok: true,
      pipeline: {
        stages: pipe.stages.map((s) => ({
          stage: s.stage,
          count: s.count,
          value: money(s.value),
          weighted: money(s.weighted),
        })),
        open: {
          count: pipe.open.count,
          value: money(pipe.open.value),
          weighted: money(pipe.open.weighted),
        },
      },
      results: {
        won: won.length,
        lost: lost.length,
        winRate: winRate(won.length, lost.length),
        avgCycleDays: avgCycleDays(won),
        wonThisQuarter: money(wonThisQuarter(leads, now)),
      },
      followups: { leadsDue: due, clientsDue },
      stale,
      quotes: {
        sent: qstat.sent,
        accepted: qstat.accepted,
        rejected: qstat.rejected,
        acceptRate: qstat.acceptRate,
        acceptedValue: money(qstat.acceptedValue),
        avgValue: money(qstat.avgValue),
        expiring: qstat.expiring.map((f) => ({
          ...brief(f),
          validUntil: byId.get(f.id)?.validUntil ?? "",
        })),
        waiting: qstat.waiting.map((f) => ({
          ...brief(f),
          days: Math.floor((now - f.updatedAt) / 86400),
        })),
      },
      period: { from, to, leads: period.length },
      sources: bySource(period).map((s) => ({
        source: s.source,
        total: s.total,
        won: s.won,
        rate: s.rate,
      })),
      monthlyWon: monthlyWon(leads, now).map((m) => ({ month: m.month, value: money(m.value) })),
      topClients: topClients
        .map((x) => ({ id: x.id, name: x.name, value: money(Number(x.value)) }))
        .filter((x) => x.value > 0),
    });
  });
