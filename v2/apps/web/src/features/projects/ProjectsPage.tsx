import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Lock, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { FilterBar } from "../../components/FilterBar";
import { SkeletonGrid } from "../../components/Resilience";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pills,
  SearchBox,
  Select,
  ViewToggle,
} from "../../components/ui";
import { day, money, moneyShort } from "../../lib/format";
import { label, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, STATUS_TONE } from "../labels";
import { type ProjectListItem, type ProjectStatus, projectsQuery } from "./api";
import { ProjectDialog } from "./ProjectDialog";

const route = getRouteApi("/projects");

export function ProjectsPage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const q = useDeferredValue(s.q ?? "");
  const list = useQuery(
    projectsQuery({
      q,
      status: s.status,
      product: s.product,
      type: s.type,
      flag: s.flag,
      sort: s.sort,
      archived: s.archived ? "1" : "0",
    }),
  );
  const [adding, setAdding] = useState(false);
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={s.archived ? "المشاريع المؤرشفة" : "المشاريع"}
        subtitle={list.data ? `${total} مشروع` : " "}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> مشروع جديد
          </Button>
        }
      />
      {s.product && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="blue">
            {s.product === "none"
              ? "مشاريع بلا خدمة"
              : `مشاريع الخدمة: ${items[0]?.productName || "…"}`}
          </Badge>
          <button
            type="button"
            onClick={() => set({ product: undefined })}
            className="text-muted underline hover:text-ink"
          >
            إزالة التصفية
          </button>
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={s.q ?? ""}
          onChange={(v) => set({ q: v || undefined })}
          placeholder="ابحث باسم المشروع أو رقمه أو اسم العميل"
        />
        <Select
          aria-label="الترتيب"
          value={s.sort ?? "newest"}
          onChange={(e) => set({ sort: e.target.value as typeof s.sort })}
          className="w-auto flex-1 sm:flex-none"
        >
          <option value="newest">الأحدث</option>
          <option value="deadline">الأقرب انتهاءً</option>
          <option value="name">الاسم</option>
          <option value="value">القيمة</option>
        </Select>
        <ViewToggle value={s.view ?? "grid"} onChange={(v) => set({ view: v })} />
      </div>
      <div className="mb-3">
        <FilterBar
          onChange={(k, v) => set({ [k]: v || undefined })}
          fields={[
            {
              key: "flag",
              label: "تحتاج انتباهاً",
              allLabel: "كل المشاريع",
              value: s.flag ?? "",
              options: [
                { value: "late", label: "متأخرة عن موعد الانتهاء" },
                { value: "due", label: "عليها دفعة متأخرة" },
              ],
            },
            {
              key: "type",
              label: "النوع",
              allLabel: "كل الأنواع",
              value: s.type ?? "",
              options: Object.entries(PROJECT_TYPE_LABELS).map(([value, l]) => ({
                value,
                label: l,
              })),
            },
          ]}
        />
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Pills<ProjectStatus>
          value={(s.status ?? "") as ProjectStatus | ""}
          onChange={(v) => set({ status: v || undefined })}
          items={[
            { value: "", label: "الكل", count: total },
            ...Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) => ({
              value: k as ProjectStatus,
              label: l,
              count: counts[k] ?? 0,
            })),
          ]}
        />
        <button
          type="button"
          onClick={() => set({ archived: s.archived ? undefined : true })}
          className="inline-flex min-h-11 items-center text-sm text-muted underline hover:text-ink sm:min-h-0"
        >
          {s.archived ? "عرض المشاريع الحالية" : "عرض المؤرشف"}
        </button>
      </div>

      {list.isPending ? (
        <SkeletonGrid label="جارٍ تحميل المشاريع" />
      ) : list.isError ? (
        <EmptyState
          title="تعذّر تحميل المشاريع"
          action={<Button onClick={() => list.refetch()}>إعادة المحاولة</Button>}
        />
      ) : items.length === 0 ? (
        q || s.status || s.product || s.type || s.flag ? (
          <EmptyState title="لا نتائج" text="جرّبوا كلمة بحث أخرى أو أزيلوا عامل التصفية." />
        ) : s.archived ? (
          <EmptyState title="لا توجد مشاريع مؤرشفة" />
        ) : (
          <EmptyState
            title="لا توجد مشاريع بعد"
            text="أفضل طريقة: افتحوا صفحة العميل ثم «مشروع جديد»، أو أضيفوه من هنا واختاروا العميل."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" /> مشروع جديد
              </Button>
            }
          />
        )
      ) : (s.view ?? "grid") === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <ProjectTable items={items} />
          </div>
          {/* A wide table does not fit a phone: the same projects as cards. */}
          <div className="grid gap-4 md:hidden">
            {items.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
      <ProjectDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);

/** Work done: stages when the project has them, else its tasks. */
export function workShare(p: ProjectListItem): { done: number; total: number } | null {
  if (p.stagesTotal) return { done: p.stagesDone ?? 0, total: p.stagesTotal };
  const t = (p.tasksOpen ?? 0) + (p.tasksDone ?? 0);
  return t ? { done: p.tasksDone ?? 0, total: t } : null;
}

/** When it ends, said plainly: late, ending soon, or the date. */
function Deadline({ p }: { p: ProjectListItem }) {
  if (!p.endDate) return null;
  const d = daysTo(p.endDate);
  if (p.late)
    return (
      <Badge tone="red">
        <AlertTriangle className="me-1 inline size-3" />
        متأخر {-d} يوم
      </Badge>
    );
  if (p.status === "active" && d >= 0 && d <= 7)
    return <Badge tone="amber">ينتهي خلال {d} يوم</Badge>;
  return <span className="text-xs text-muted">ينتهي {day(p.endDate)}</span>;
}

function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "green" }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <span
        className={`block h-full rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-brand"}`}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </span>
  );
}

/**
 * A project at a glance: who and what, then its health — work done, money in, the next instalment
 * and whether it is running late — so the list answers «what needs me?» without opening each one.
 */
function ProjectCard({ p }: { p: ProjectListItem }) {
  const work = workShare(p);
  const collected =
    p.received !== null && p.received !== undefined && p.contractTotal > 0
      ? p.received / p.contractTotal
      : null;
  const dueLate = !!p.nextDueDate && p.nextDueDate < today();
  return (
    <Link to="/projects/$id" params={{ id: p.id }} className="group block">
      <Card
        className={`flex h-full flex-col gap-3 transition group-hover:border-brand group-hover:shadow-md ${p.late ? "border-red-200 dark:border-red-900" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
            <Deadline p={p} />
          </span>
          <span className="flex items-center gap-1 text-xs text-muted" dir="ltr">
            {p.visibility === "private" && <Lock className="size-3" aria-label="خاص" />}
            {p.number}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{p.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Avatar name={p.clientName} logo={p.clientLogoUrl} size="xs" />
            <span className="truncate">{p.clientName}</span>
          </p>
          {p.productName && (
            <p className="mt-1.5 text-xs text-brand">
              {p.productName}
              {p.packageName && ` · ${p.packageName}`}
            </p>
          )}
        </div>
        {(work || collected !== null) && (
          <div className="space-y-2 text-xs">
            {work && (
              <div>
                <span className="mb-1 flex justify-between text-muted">
                  <span>التنفيذ</span>
                  <span className="tabular-nums">
                    {work.done}/{work.total}
                    {!!p.tasksOverdue && (
                      <b className="ms-1.5 font-semibold text-red-600">· {p.tasksOverdue} متأخرة</b>
                    )}
                  </span>
                </span>
                <Bar value={work.done / work.total} />
              </div>
            )}
            {collected !== null && (
              <div>
                <span className="mb-1 flex justify-between text-muted">
                  <span>التحصيل</span>
                  <span className="tabular-nums">
                    {money(p.received ?? 0)} من {money(p.contractTotal)}
                  </span>
                </span>
                <Bar value={collected} tone="green" />
              </div>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-muted">
            {label(PROJECT_TYPE_LABELS, p.type)}
            {p.startDate && ` · ${day(p.startDate)}`}
          </span>
          {p.contractTotal > 0 && (
            <span title={p.estimated ? "تقديري: القيمة المتوقعة + 15% حتى يُسجَّل العقد" : undefined}>
              {moneyShort(p.contractTotal)}
              {p.estimated && <span className="ms-1 text-xs text-muted">تقديري</span>}
            </span>
          )}
        </div>
        {p.nextDueDate && p.nextDueAmount !== null && (
          <p
            className={`-mt-1 flex items-center gap-1.5 text-xs ${dueLate ? "font-semibold text-red-600" : "text-muted"}`}
          >
            <CalendarClock className="size-3.5" />
            {dueLate ? "دفعة متأخرة" : "الدفعة القادمة"}: {money(p.nextDueAmount ?? 0)} ·{" "}
            {day(p.nextDueDate)}
          </p>
        )}
      </Card>
    </Link>
  );
}

function ProjectTable({ items }: { items: ProjectListItem[] }) {
  // Hidden when no project uses it: an empty «الخدمة» column is noise.
  const services = items.some((p) => p.productName);
  return (
    <Card className="p-0">
      <DataTable
        caption="المشاريع"
        rows={items}
        rowKey={(p) => p.id}
        columns={[
          {
            key: "name",
            header: "المشروع",
            primary: true,
            sort: (p) => p.name,
            cell: (p) => (
              <>
                <Link
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="font-semibold hover:text-brand"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-muted">
                  <span dir="ltr">{p.number}</span> · {p.clientName}
                </div>
              </>
            ),
          },
          {
            key: "status",
            header: "الحالة",
            sort: (p) => p.status,
            cell: (p) => (
              <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
            ),
          },
          {
            key: "type",
            header: "النوع",
            hideOnCard: true,
            sort: (p) => p.type,
            cell: (p) => label(PROJECT_TYPE_LABELS, p.type),
          },
          ...(services
            ? [
                {
                  key: "service",
                  header: "الخدمة",
                  hideOnCard: true,
                  cell: (p: ProjectListItem) =>
                    p.productName
                      ? `${p.productName}${p.packageName ? ` · ${p.packageName}` : ""}`
                      : "—",
                },
              ]
            : []),
          {
            key: "end",
            header: "الانتهاء",
            sort: (p) => p.endDate || "9999",
            hideOnCard: true,
            cell: (p) => (p.endDate ? <Deadline p={p} /> : "—"),
          },
          {
            key: "work",
            header: "التنفيذ",
            numeric: true,
            hideOnCard: true,
            cell: (p) => {
              const w = workShare(p);
              return w ? `${w.done}/${w.total}` : "—";
            },
          },
          {
            key: "received",
            header: "المحصّل",
            numeric: true,
            sort: (p) => p.received ?? -1,
            cell: (p) =>
              p.received === null || p.received === undefined ? "—" : moneyShort(p.received),
          },
          {
            key: "value",
            header: "قيمة العقد",
            numeric: true,
            sort: (p) => p.contractTotal,
            cell: (p) => (
              <>
                {p.contractTotal ? moneyShort(p.contractTotal) : "—"}
                {p.estimated && p.contractTotal > 0 && (
                  <span className="ms-1 text-xs text-muted">تقديري</span>
                )}
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}
