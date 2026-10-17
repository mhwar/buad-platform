import { followUpState } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  FileUp,
  Gavel,
  ListChecks,
  Phone,
  ShoppingCart,
} from "lucide-react";
import type { ReactNode } from "react";
import { SectionBoundary } from "./components/Resilience";
import { Badge, Card, cx } from "./components/ui";
import { followupsQuery } from "./features/clients/api";
import { AttentionPanel } from "./features/home/AttentionPanel";
import { projectsQuery } from "./features/projects/api";
import { overviewQuery } from "./features/sales/api";
import { type Task, tasksQuery } from "./features/tasks/queries";
import { send } from "./features/team/queries";
import {
  addDaysLocal,
  decisionsQuery,
  localDay,
  meetingsQuery,
  timeOf,
} from "./features/workspace/api";
import { DecisionList } from "./features/workspace/DecisionList";
import { day, money, sar } from "./lib/format";
import { meQuery, useCan } from "./session";

const longDate = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const greeting = (h: number) => (h < 12 ? "صباح الخير" : h < 18 ? "مساء الخير" : "مساء النور");

/**
 * «اليوم»: where the day starts. What needs attention, my tasks, my meetings this week, the
 * decisions I owe, who to call today — and a few numbers for my role. Each card leads to its page.
 */
export function Home() {
  const me = useQuery(meQuery).data;
  const can = useCan();
  const now = new Date();
  const first = me?.name?.split(" ")[0] ?? "";
  return (
    <>
      <header className="mb-6">
        <p className="text-sm text-muted">{longDate.format(now)}</p>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {greeting(now.getHours())}، {first}
        </h1>
        <span className="sr-only">أهلاً {me?.name}</span>
      </header>
      {me?.perms.includes("import.run") && <ImportHint />}
      <SectionBoundary label="ما يحتاج انتباهك">
        <AttentionPanel />
      </SectionBoundary>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {can("tasks.view") && (
            <SectionBoundary label="مهامي">
              <MyTasks />
            </SectionBoundary>
          )}
          {can("meetings.view") && (
            <SectionBoundary label="اجتماعاتي">
              <MyMeetings />
            </SectionBoundary>
          )}
          {can("meetings.view") && (
            <SectionBoundary label="قراراتي">
              <MyDecisions />
            </SectionBoundary>
          )}
        </div>
        <aside className="space-y-5" aria-label="أرقامك">
          {can("clients.view") && (
            <SectionBoundary label="المتابعات">
              <MyFollowups />
            </SectionBoundary>
          )}
          {can("sales.view") && (
            <SectionBoundary label="أرقام المبيعات">
              <SalesNumbers />
            </SectionBoundary>
          )}
          {can("projects.view") && (
            <SectionBoundary label="أرقام المشاريع">
              <ProjectNumbers />
            </SectionBoundary>
          )}
        </aside>
      </div>
    </>
  );
}

function Panel({
  title,
  icon,
  to,
  more,
  children,
}: {
  title: string;
  icon: ReactNode;
  to: string;
  more: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand">
            {icon}
          </span>
          {title}
        </h2>
        <a href={to} className="text-sm text-brand hover:underline">
          {more}
        </a>
      </div>
      {children}
    </Card>
  );
}
const Quiet = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl bg-canvas/60 px-3 py-4 text-center text-sm text-muted">{children}</p>
);

function MyTasks() {
  const qc = useQueryClient();
  const q = useQuery(tasksQuery({ mine: true }));
  const t = localDay();
  const open = (q.data ?? []).filter((x) => x.status !== "done");
  const late = open.filter((x) => x.dueDate && x.dueDate < t);
  const todays = open.filter((x) => x.dueDate === t);
  const next = open.filter((x) => !x.dueDate || x.dueDate > t).slice(0, 5);
  const done = async (x: Task) => {
    await send("PATCH", `/api/tasks/${x.id}`, { status: "done" });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const group = (label: string, rows: Task[], tone?: "late") =>
    rows.length > 0 && (
      <div>
        <p className={cx("mb-1 text-xs font-semibold", tone ? "text-red-600" : "text-muted")}>
          {label} ({rows.length})
        </p>
        <ul className="divide-y rounded-xl border">
          {rows.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                aria-label={`إنجاز ${x.title}`}
                onClick={() => done(x)}
                className="grid size-6 shrink-0 place-items-center rounded-full border-2 text-transparent transition hover:border-emerald-500 hover:text-emerald-500"
              >
                <Check className="size-3.5" />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{x.title}</span>
                {x.projectName && <span className="text-xs text-muted">{x.projectName}</span>}
              </span>
              {x.dueDate && (
                <span className={cx("shrink-0 text-xs", tone ? "text-red-600" : "text-muted")}>
                  {day(x.dueDate)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <Panel
      title="مهامي"
      icon={<ListChecks className="size-4" />}
      to="/tasks?mine=1"
      more="كل مهامي"
    >
      {q.isPending ? (
        <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : open.length === 0 ? (
        <Quiet>لا مهام مفتوحة عليك. يوم هادئ!</Quiet>
      ) : (
        <div className="space-y-3">
          {group("متأخرة", late, "late")}
          {group("اليوم", todays)}
          {group("القادمة", next)}
        </div>
      )}
    </Panel>
  );
}

function MyMeetings() {
  const t = localDay();
  const q = useQuery(meetingsQuery({ from: t, to: addDaysLocal(6), mine: "1" }));
  const rows = (q.data ?? []).filter((m) => m.status !== "cancelled");
  const todays = rows.filter((m) => m.startsAt.startsWith(t));
  const later = rows.filter((m) => !m.startsAt.startsWith(t));
  // A meeting starting within the hour stands out.
  const soon = (m: (typeof rows)[number]) => {
    if (m.status !== "scheduled") return null;
    const mins = Math.round((new Date(m.startsAt).getTime() - Date.now()) / 60000);
    return mins >= 0 && mins <= 60 ? mins : null;
  };
  const item = (m: (typeof rows)[number], withDay: boolean) => (
    <li key={m.id}>
      <Link
        to="/meetings"
        search={{ open: m.id }}
        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-brand-soft"
      >
        <span className="w-20 shrink-0 text-sm font-semibold tabular-nums">
          {withDay ? day(m.startsAt.slice(0, 10)).replace(/\s*\d{4}.*/, "") : timeOf(m.startsAt)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{m.title}</span>
          <span className="block truncate text-xs text-muted">
            {[withDay ? timeOf(m.startsAt) : "", m.location, m.clientName || m.requestName]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {m.status === "done" && <Badge tone="green">عُقد</Badge>}
        {soon(m) !== null && <Badge tone="amber">بعد {soon(m)} د</Badge>}
      </Link>
    </li>
  );
  return (
    <Panel
      title="اجتماعاتي"
      icon={<CalendarDays className="size-4" />}
      to="/meetings"
      more="كل الاجتماعات"
    >
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : rows.length === 0 ? (
        <Quiet>لا اجتماعات لك هذا الأسبوع.</Quiet>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">اليوم ({todays.length})</p>
          {todays.length ? (
            <ul>{todays.map((m) => item(m, false))}</ul>
          ) : (
            <Quiet>لا شيء اليوم.</Quiet>
          )}
          {later.length > 0 && (
            <>
              <p className="text-xs font-semibold text-muted">بقية الأسبوع ({later.length})</p>
              <ul>{later.map((m) => item(m, true))}</ul>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function MyDecisions() {
  const q = useQuery(decisionsQuery({ mine: "1", status: "open" }));
  const rows = q.data ?? [];
  return (
    <Panel
      title="قرارات عليّ تنفيذها"
      icon={<Gavel className="size-4" />}
      to="/decisions?mine=1"
      more="كل القرارات"
    >
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : rows.length === 0 ? (
        <Quiet>لا قرارات مفتوحة مسندة إليك.</Quiet>
      ) : (
        <DecisionList items={rows.slice(0, 6)} compact />
      )}
    </Panel>
  );
}

function MyFollowups() {
  const q = useQuery(followupsQuery("mine"));
  const t = localDay();
  const due = (q.data?.items ?? []).filter((i) =>
    ["overdue", "today"].includes(followUpState(i.date, t)),
  );
  return (
    <Panel
      title="من أتابع اليوم"
      icon={<Phone className="size-4" />}
      to="/sales/followups"
      more="كل المتابعات"
    >
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : due.length === 0 ? (
        <Quiet>لا متابعات مستحقة عليك اليوم.</Quiet>
      ) : (
        <ul className="space-y-1">
          {due.slice(0, 8).map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              <a
                href={i.kind === "client" ? `/clients/${i.id}` : `/sales/${i.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-soft"
              >
                <span className="min-w-0 truncate">
                  {i.subtitle || i.title}
                  <span className="block text-xs text-muted">
                    {i.kind === "client" ? "عميل" : "فرصة"}
                    {i.value > 0 && ` · ${sar(i.value)}`}
                  </span>
                </span>
                <span
                  className={cx(
                    "inline-flex shrink-0 items-center gap-1 text-xs",
                    i.date < t ? "font-semibold text-red-600" : "text-amber-700",
                  )}
                >
                  <CalendarClock className="size-3" />
                  {i.date < t ? "متأخرة" : "اليوم"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Num({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-canvas/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function SalesNumbers() {
  const q = useQuery(overviewQuery());
  const o = q.data;
  return (
    <Panel title="المبيعات" icon={<ShoppingCart className="size-4" />} to="/sales" more="الفرص">
      {!o ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Num
            label="فرص مفتوحة"
            value={String(o.pipeline.open.count)}
            hint={sar(o.pipeline.open.value)}
          />
          <Num label="مرجّحة" value={sar(o.pipeline.open.weighted)} />
          <Num label="مكسوب الربع" value={sar(o.results.wonThisQuarter)} />
          <Num
            label="نسبة الكسب"
            value={o.results.winRate === null ? "—" : `${o.results.winRate}%`}
          />
        </div>
      )}
    </Panel>
  );
}

function ProjectNumbers() {
  const q = useQuery(projectsQuery({}));
  const items = q.data?.items ?? [];
  const active = items.filter((p) => p.status === "active");
  const value = active.reduce((a, p) => a + p.contractTotal, 0);
  return (
    <Panel
      title="المشاريع"
      icon={<Briefcase className="size-4" />}
      to="/projects"
      more="كل المشاريع"
    >
      {!q.data ? (
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Num label="مشاريع جارية" value={String(q.data.counts.active ?? 0)} />
            <Num label="قيمة عقودها" value={money(value)} />
          </div>
          {active.length > 0 && (
            <ul className="space-y-1">
              {active.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <Link
                    to="/projects/$id"
                    params={{ id: p.id }}
                    className="block truncate rounded-lg px-2 py-1.5 text-sm hover:bg-brand-soft"
                  >
                    {p.name}
                    <span className="block text-xs text-muted">{p.clientName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

/** For a new organisation: bring the existing clients over first. */
function ImportHint() {
  const q = useQuery(projectsQuery({}));
  if (!q.data || q.data.items.length > 0) return null;
  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-brand bg-brand-soft">
      <div>
        <p className="font-semibold">ابدؤوا بنقل عملائكم من المنصة الحالية</p>
        <p className="mt-1 text-sm text-muted">
          اختاروا عميلاً أو أكثر بكامل بياناته ومشاريعه، ثم أضيفوا البقية تدريجياً.
        </p>
      </div>
      <Link
        to="/settings/import"
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white dark:text-canvas"
      >
        <FileUp className="size-4" /> استيراد من المنصة الحالية
      </Link>
    </Card>
  );
}
