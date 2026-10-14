import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
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
import { day, money } from "../../lib/format";
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
          <option value="name">الاسم</option>
          <option value="value">القيمة</option>
        </Select>
        <ViewToggle value={s.view ?? "grid"} onChange={(v) => set({ view: v })} />
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
        <p className="text-muted">جارٍ التحميل…</p>
      ) : list.isError ? (
        <EmptyState
          title="تعذّر تحميل المشاريع"
          action={<Button onClick={() => list.refetch()}>إعادة المحاولة</Button>}
        />
      ) : items.length === 0 ? (
        q || s.status ? (
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
        <ProjectTable items={items} />
      )}
      <ProjectDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function ProjectCard({ p }: { p: ProjectListItem }) {
  return (
    <Link to="/projects/$id" params={{ id: p.id }} className="group block">
      <Card className="flex h-full flex-col transition group-hover:border-brand group-hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted" dir="ltr">
            {p.visibility === "private" && <Lock className="size-3" aria-label="خاص" />}
            {p.number}
          </span>
        </div>
        <p className="mt-3 font-semibold">{p.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Avatar name={p.clientName} logo={p.clientLogoUrl} size="xs" />
          <span className="truncate">{p.clientName}</span>
        </p>
        {p.productName && (
          <p className="mt-2 text-xs text-brand">
            {p.productName}
            {p.packageName && ` · ${p.packageName}`}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted">
            {label(PROJECT_TYPE_LABELS, p.type)}
            {p.startDate && ` · ${day(p.startDate)}`}
          </span>
          {p.contractTotal > 0 && <span>{money(p.contractTotal)}</span>}
        </div>
      </Card>
    </Link>
  );
}

function ProjectTable({ items }: { items: ProjectListItem[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b text-right text-xs text-muted">
          <tr>
            <th className="p-3 font-medium">المشروع</th>
            <th className="p-3 font-medium">العميل</th>
            <th className="p-3 font-medium">الحالة</th>
            <th className="p-3 font-medium">النوع</th>
            <th className="p-3 font-medium">الخدمة</th>
            <th className="p-3 font-medium">البداية</th>
            <th className="p-3 font-medium">قيمة العقد</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-brand-soft/50">
              <td className="p-3">
                <Link
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="font-semibold hover:text-brand"
                >
                  {p.name}
                </Link>
                <div className="text-xs text-muted" dir="ltr">
                  {p.number}
                </div>
              </td>
              <td className="p-3">
                <Link
                  to="/clients/$id"
                  params={{ id: p.clientId }}
                  className="inline-flex items-center gap-1.5 hover:text-brand"
                >
                  <Avatar name={p.clientName} logo={p.clientLogoUrl} size="xs" />
                  {p.clientName}
                </Link>
              </td>
              <td className="p-3">
                <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
              </td>
              <td className="p-3">{label(PROJECT_TYPE_LABELS, p.type)}</td>
              <td className="p-3">
                {p.productName
                  ? `${p.productName}${p.packageName ? ` · ${p.packageName}` : ""}`
                  : "—"}
              </td>
              <td className="p-3">{day(p.startDate) || "—"}</td>
              <td className="p-3">{p.contractTotal ? money(p.contractTotal) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
