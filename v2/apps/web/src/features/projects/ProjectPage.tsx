import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Info, Menu, Notice, Tabs } from "../../components/ui";
import { day, fromEpoch, money } from "../../lib/format";
import { meQuery } from "../../session";
import { clientKeys } from "../clients/api";
import { label, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, STATUS_TONE } from "../labels";
import {
  archiveProject,
  deleteProject,
  type ProjectStatus,
  projectKeys,
  projectQuery,
  updateProject,
} from "./api";
import { ProjectDialog } from "./ProjectDialog";

const route = getRouteApi("/projects/$id");

export function ProjectPage() {
  const { id } = route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery(meQuery).data;
  const q = useQuery(projectQuery(id));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isPending) return <p className="text-muted">جارٍ التحميل…</p>;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="المشروع غير موجود"
        action={
          <Link to="/projects" className="text-brand underline">
            العودة إلى المشاريع
          </Link>
        }
      />
    );

  const { project: p, client } = q.data;
  const manager = me?.role === "owner" || me?.role === "admin";
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKeys.all }),
      qc.invalidateQueries({ queryKey: clientKeys.all }),
    ]);
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try {
      await fn();
      await refresh();
      after?.();
    } catch (x) {
      const code = (x as { body?: { error?: string } }).body?.error;
      setError(
        code === "client_archived" ? "العميل مؤرشف. استعيدوا العميل أولاً." : "تعذّر تنفيذ العملية",
      );
    }
  };

  // Quick status change, applied optimistically so the badge updates instantly.
  const setStatus = async (status: ProjectStatus) => {
    const key = projectKeys.detail(id);
    const prev = qc.getQueryData(key);
    qc.setQueryData(key, { ...q.data, project: { ...p, status } });
    try {
      await updateProject(id, { status });
      await refresh();
    } catch {
      qc.setQueryData(key, prev);
      setError("تعذّر تغيير الحالة");
    }
  };

  const menu = [
    ...Object.entries(PROJECT_STATUS_LABELS)
      .filter(([k]) => k !== p.status)
      .map(([k, l]) => ({
        label: `تغيير الحالة إلى: ${l}`,
        onSelect: () => setStatus(k as ProjectStatus),
      })),
    ...(manager
      ? [
          p.archivedAt
            ? { label: "استعادة المشروع", onSelect: () => act(() => archiveProject(p.id, true)) }
            : { label: "أرشفة المشروع", onSelect: () => act(() => archiveProject(p.id)) },
        ]
      : []),
    ...(me?.role === "owner"
      ? [
          {
            label: "حذف نهائي",
            danger: true,
            onSelect: () => {
              if (confirm(`حذف «${p.name}» نهائياً؟ لا يمكن التراجع.`))
                act(
                  () => deleteProject(p.id),
                  () => navigate({ to: "/projects" }),
                );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <nav className="mb-4 text-sm text-muted">
        <Link to="/projects" className="hover:text-ink">
          المشاريع
        </Link>
        {client && (
          <>
            {" / "}
            <Link to="/clients/$id" params={{ id: client.id }} className="hover:text-ink">
              {client.name}
            </Link>
          </>
        )}
        {" / "}
        <span className="text-ink">{p.name}</span>
      </nav>
      {error && <Notice>{error}</Notice>}
      {p.archivedAt && (
        <Notice tone="amber">هذا المشروع مؤرشف منذ {fromEpoch(p.archivedAt)}.</Notice>
      )}

      <Card className="mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
            {p.visibility === "private" && (
              <Badge>
                <Lock className="me-1 size-3" /> خاص
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            <span dir="ltr">{p.number}</span>
            {client && (
              <>
                {" · "}
                <Link
                  to="/clients/$id"
                  params={{ id: client.id }}
                  className="text-brand hover:underline"
                >
                  {client.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> تعديل
          </Button>
          <Menu items={menu} />
        </div>
      </Card>

      <Tabs
        items={[
          { to: "", label: "نظرة عامة", active: true },
          { to: "", label: "المالية", active: false, disabled: true },
          { to: "", label: "العقود", active: false, disabled: true },
          { to: "", label: "الخطابات", active: false, disabled: true },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">بيانات المشروع</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Info label="نوع المشروع" value={label(PROJECT_TYPE_LABELS, p.type)} />
            <Info label="المدينة / الموقع" value={p.location} />
            <Info label="تاريخ البداية" value={day(p.startDate)} />
            <Info label="تاريخ الانتهاء المتوقع" value={day(p.endDate)} />
            <Info label="تاريخ استلام الدفعة المالية" value={day(p.payDate)} />
            <Info label="الظهور" value={p.visibility === "private" ? "خاص" : "الفريق"} />
          </dl>
          {p.notes && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold">ملاحظات</h3>
              <p className="whitespace-pre-wrap text-sm">{p.notes}</p>
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">قيمة العقد المتوقعة</h2>
          <p className="text-3xl font-bold">{money(p.expectedValue)}</p>
          <p className="mt-4 text-xs text-muted">
            أُضيف {fromEpoch(p.createdAt)} · آخر تعديل {fromEpoch(p.updatedAt)}
          </p>
          <p className="mt-4 rounded-lg bg-brand-soft p-3 text-xs text-brand">
            المالية والعقود والخطابات تُضاف هنا تباعاً في الوحدات القادمة، مرتبطة بهذا المشروع.
          </p>
        </Card>
      </div>

      <ProjectDialog open={editing} onOpenChange={setEditing} existing={q.data} />
    </>
  );
}
