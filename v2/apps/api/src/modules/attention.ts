import {
  clients,
  decisions,
  documents,
  financeEntries,
  meetings,
  orgProfile,
  paymentSchedule,
  planCycles,
  planInitiatives,
  productRequests,
  products,
  projects,
  quotes,
  tasks,
  users,
} from "@buad/schema/db";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type Vars } from "../auth/middleware";
import { nowSec } from "./common";
import { financeChecks } from "./finance-checks";
import { visibleProjects } from "./projects";

type Item = { key: string; tone: "warn" | "info"; title: string; count: number; link: string };

const count = async (q: PromiseLike<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

/**
 * «ما يحتاج انتباهك اليوم»: computed when asked, from live data, and only the lines the person's
 * role may act on. Nothing is stored, so it can never be stale.
 */
export const attentionApp = new Hono<{ Variables: Vars }>().use(requireAuth).get("/", async (c) => {
  const me = c.get("user");
  const db = c.get("db");
  const can = (p: string) => me.perms.includes(p);
  const today = new Date().toISOString().slice(0, 10);
  const items: Item[] = [];
  const add = (i: Item) => i.count > 0 && items.push(i);

  if (can("sales.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(productRequests)
        .where(
          and(
            eq(productRequests.orgId, me.orgId),
            eq(productRequests.status, "new"),
            lt(productRequests.createdAt, nowSec() - 3 * 86400),
          ),
        ),
    );
    const due = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(productRequests)
        .where(
          and(
            eq(productRequests.orgId, me.orgId),
            inArray(productRequests.status, ["new", "contacted", "quoted", "negotiating"]),
            ne(productRequests.followUpAt, ""),
            lt(productRequests.followUpAt, today),
          ),
        ),
    );
    const clientsDue = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(clients)
        .where(
          and(
            eq(clients.orgId, me.orgId),
            isNull(clients.archivedAt),
            ne(clients.nextFollowUpAt, ""),
            lt(clients.nextFollowUpAt, today),
          ),
        ),
    );
    add({
      key: "followups",
      tone: "warn",
      title: "متابعات مبيعات وعملاء حان موعدها",
      count: due + clientsDue,
      link: "/sales/followups",
    });
    add({
      key: "requests",
      tone: "warn",
      title: "طلبات عروض لم يُتواصل معها منذ أكثر من 3 أيام",
      count: n,
      link: "/sales",
    });
  }
  if (can("sales.view")) {
    const sentQuotes = await db
      .select({ validUntil: quotes.validUntil, updatedAt: quotes.updatedAt })
      .from(quotes)
      .where(and(eq(quotes.orgId, me.orgId), eq(quotes.status, "sent")));
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    add({
      key: "quotes-expiring",
      tone: "warn",
      title: "عروض أسعار تنتهي صلاحيتها خلال 3 أيام",
      count: sentQuotes.filter(
        (q) => q.validUntil !== "" && q.validUntil >= today && q.validUntil <= soon,
      ).length,
      link: "/sales/quotes",
    });
    add({
      key: "quotes-waiting",
      tone: "info",
      title: "عروض أُرسلت ولم يُردّ عليها منذ أسبوع",
      count: sentQuotes.filter((q) => nowSec() - q.updatedAt > 7 * 86400).length,
      link: "/sales/quotes",
    });
  }
  if (can("documents.edit")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(documents)
        .innerJoin(projects, eq(projects.id, documents.projectId))
        .where(
          and(
            eq(documents.orgId, me.orgId),
            eq(documents.status, "review"),
            visibleProjects(me).where,
          ),
        ),
    );
    add({
      key: "docs",
      tone: "info",
      title: "مستندات بانتظار الاعتماد",
      count: n,
      link: "/documents?status=review",
    });
  }
  if (can("projects.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(projects)
        .where(
          and(
            eq(projects.orgId, me.orgId),
            isNull(projects.archivedAt),
            eq(projects.status, "active"),
            ne(projects.endDate, ""),
            lt(projects.endDate, today),
            visibleProjects(me).where,
          ),
        ),
    );
    add({
      key: "overdue",
      tone: "warn",
      title: "مشاريع جارية تجاوزت تاريخ انتهائها",
      count: n,
      link: "/projects?status=active",
    });
  }
  if (can("finance.edit") && me.scopes.projects === "all") {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(financeEntries)
        .innerJoin(projects, eq(projects.id, financeEntries.projectId))
        .where(
          and(
            eq(projects.orgId, me.orgId),
            eq(financeEntries.status, "pending"),
            isNull(projects.archivedAt),
          ),
        ),
    );
    add({
      key: "pending",
      tone: "info",
      title: "حركات مالية معلّقة تنتظر السداد",
      count: n,
      link: "/finance",
    });
  }
  if (can("treasury.view")) {
    const checks = await financeChecks(db, me.orgId);
    add({
      key: "finance-checks",
      tone: "warn",
      title: "أرقام مالية تحتاج تدخلك",
      count: checks.reduce((s, c) => s + c.rows.length, 0),
      link: "/finance",
    });
  }
  if (can("treasury.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(paymentSchedule)
        // Same list as «التحصيل»: archived projects are out of it.
        .innerJoin(projects, eq(projects.id, paymentSchedule.projectId))
        .where(
          and(
            eq(paymentSchedule.orgId, me.orgId),
            eq(paymentSchedule.status, "pending"),
            lt(paymentSchedule.dueDate, today),
            isNull(projects.archivedAt),
          ),
        ),
    );
    add({
      key: "instalments",
      tone: "warn",
      title: "دفعات عملاء تجاوزت موعد استحقاقها",
      count: n,
      link: "/finance?tab=receivables",
    });
  }
  if (can("tasks.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(tasks)
        .where(
          and(
            eq(tasks.orgId, me.orgId),
            eq(tasks.assigneeId, me.id),
            ne(tasks.status, "done"),
            ne(tasks.dueDate, ""),
            lt(tasks.dueDate, today),
          ),
        ),
    );
    add({
      key: "tasks",
      tone: "warn",
      title: "مهام مسندة إليك تجاوزت موعدها",
      count: n,
      link: "/tasks?mine=1",
    });
  }
  if (can("meetings.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(decisions)
        .where(
          and(
            eq(decisions.orgId, me.orgId),
            eq(decisions.ownerId, me.id),
            eq(decisions.status, "open"),
            ne(decisions.dueDate, ""),
            lt(decisions.dueDate, today),
          ),
        ),
    );
    // Meetings are kept in the team's local clock (Saudi time).
    const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
      new Date(),
    );
    const meetingsToday = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(meetings)
        .where(
          and(
            eq(meetings.orgId, me.orgId),
            eq(meetings.status, "scheduled"),
            sql`substr(${meetings.startsAt}, 1, 10) = ${localToday}`,
            sql`(${meetings.createdBy} = ${me.id} OR EXISTS (SELECT 1 FROM json_each(${meetings.attendeeIds}) WHERE value = ${me.id}))`,
          ),
        ),
    );
    add({
      key: "meetings",
      tone: "info",
      title: "اجتماعاتك اليوم",
      count: meetingsToday,
      link: "/meetings",
    });
    add({
      key: "decisions",
      tone: "warn",
      title: "قرارات مسندة إليك تجاوزت موعدها",
      count: n,
      link: "/decisions?mine=1",
    });
  }
  if (can("plans.view")) {
    const n = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(planInitiatives)
        .where(
          and(
            eq(planInitiatives.orgId, me.orgId),
            ne(planInitiatives.status, "done"),
            ne(planInitiatives.dueDate, ""),
            lt(planInitiatives.dueDate, today),
          ),
        ),
    );
    add({
      key: "initiatives",
      tone: "warn",
      title: "مبادرات في الخطط تجاوزت موعدها",
      count: n,
      link: "/plans",
    });
  }
  // The quarter that just ended: its objectives in active plans want a review.
  if (can("plans.edit")) {
    const d = new Date(`${today}T00:00:00Z`);
    const q = Math.floor(d.getUTCMonth() / 3); // the last finished quarter of this year (0 = none yet)
    if (q >= 1) {
      const year = String(d.getUTCFullYear());
      const row = (await db.get(sql`
        SELECT COUNT(*) AS n FROM plan_objectives o JOIN plan_cycles c ON c.id = o.cycle_id
        WHERE o.org_id = ${me.orgId} AND c.status = 'active' AND substr(c.start_date, 1, 4) = ${year}
          AND o.quarter = ${q}
          AND NOT EXISTS (SELECT 1 FROM plan_reviews r WHERE r.objective_id = o.id AND r.quarter = ${q})`)) as
        | { n: number }
        | undefined;
      add({
        key: "plan-review",
        tone: "info",
        title: `مراجعة الربع ${q} في الخطة لم تُسجَّل بعد`,
        count: Number(row?.n ?? 0),
        link: "/plans",
      });
    }
  }

  // A short list for whoever sets the platform up; disappears when everything is done.
  let checklist: { key: string; label: string; done: boolean; link: string }[] = [];
  if (can("org.edit")) {
    const [prof] = await db
      .select()
      .from(orgProfile)
      .where(eq(orgProfile.orgId, me.orgId))
      .limit(1);
    const has = async (
      t: typeof clients | typeof projects | typeof planCycles,
      w: ReturnType<typeof eq>,
    ) => (await count(db.select({ n: sql<number>`count(*)` }).from(t).where(w))) > 0;
    const published = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(products)
        .where(and(eq(products.orgId, me.orgId), eq(products.status, "published"))),
    );
    const members = await count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .where(and(eq(users.orgId, me.orgId), eq(users.active, true))),
    );
    checklist = [
      {
        key: "org",
        label: "أكمل بيانات الجهة والرقم الضريبي",
        done: !!prof?.name && !!prof?.tax,
        link: "/settings/org",
      },
      {
        key: "client",
        label: "أضف أول عميل",
        done: await has(clients, eq(clients.orgId, me.orgId)),
        link: "/clients",
      },
      {
        key: "project",
        label: "أضف أول مشروع",
        done: await has(projects, eq(projects.orgId, me.orgId)),
        link: "/projects",
      },
      { key: "product", label: "انشر أول خدمة", done: published > 0, link: "/products" },
      { key: "team", label: "ادعُ زميلاً إلى المنصة", done: members > 1, link: "/settings/team" },
      {
        key: "plan",
        label: "ابدأ خطتك التشغيلية",
        done: await has(planCycles, eq(planCycles.orgId, me.orgId)),
        link: "/plans",
      },
    ];
    if (checklist.every((i) => i.done)) checklist = [];
  }
  return c.json({ ok: true, items, checklist });
});
