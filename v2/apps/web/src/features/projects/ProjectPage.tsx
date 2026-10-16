import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Download,
  FileBarChart2,
  FileCheck2,
  FileText,
  Link2,
  ListChecks,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTrackRecent } from "../../components/shell/useRecent";
import {
  Avatar,
  BadgeMenu,
  Button,
  Card,
  EmptyState,
  Menu,
  type MenuItem,
  Notice,
  Segmented,
} from "../../components/ui";
import { day, fromEpoch } from "../../lib/format";
import { meQuery } from "../../session";
import { clientKeys } from "../clients/api";
import { documentsQuery } from "../documents/api";
import { DocumentsSection } from "../documents/DocumentsSection";
import { type Finance, financeKey } from "../finance/api";
import {
  ContractSummary,
  exportCsv,
  FinanceSettings,
  FinanceStrip,
  Transactions,
} from "../finance/FinanceTab";
import { ReceiptsCard } from "../finance/Receipts";
import { label, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, STATUS_TONE } from "../labels";
import { ScheduleCard } from "../receivables/ScheduleCard";
import { ExecutionTab } from "../tasks/ExecutionTab";
import { executionQuery } from "../tasks/queries";
import { ProjectMembers } from "../team/ProjectMembers";
import {
  archiveProject,
  deleteProject,
  type ProjectStatus,
  projectKeys,
  projectQuery,
  updateProject,
} from "./api";
import { ProjectDialog } from "./ProjectDialog";
import { ProjectPulse } from "./ProjectPulse";

const route = getRouteApi("/projects/$id");
type Section = "finance" | "documents" | "execution";

/**
 * Project page, organised by use:
 *  header      — identity and the few actions people need (status is a click on the badge)
 *  strip       — the four numbers everyone looks for first
 *  main        — today's work, in three sections that also host the coming modules:
 *                المالية · المستندات (contracts, letters) · التنفيذ (tasks, event planning)
 *  side column — always-visible context: contract breakdown, project details, history
 *  settings    — contract terms and budget in a side sheet (set once, revisited rarely)
 */
export function ProjectPage() {
  const { id } = route.useParams();
  const search = route.useSearch();
  const nav = route.useNavigate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery(meQuery).data;
  const q = useQuery(projectQuery(id));
  const docs = useQuery({ ...documentsQuery(id), enabled: !!me?.perms.includes("documents.view") });
  const execution = useQuery({
    ...executionQuery(id),
    enabled: !!me?.perms.includes("tasks.view"),
  });
  useTrackRecent(
    q.data ? { kind: "project", id, title: q.data.project.name, href: `/projects/${id}` } : null,
  );
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [members, setMembers] = useState(false);
  const [adding, setAdding] = useState<"new" | "agreement" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const section: Section = search.view ?? "finance";

  if (q.isPending) return <ProjectSkeleton />;
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

  const { project: p, client, service } = q.data;
  // Counts on the section switcher: how many documents, how much of the work is done.
  const docCount = docs.data?.length ?? 0;
  const exStages = execution.data?.stages ?? [];
  const exTasks = execution.data?.tasks ?? [];
  const workLabel = exStages.length
    ? `${exStages.filter((x) => x.status === "done").length}/${exStages.length}`
    : exTasks.length
      ? `${exTasks.filter((x) => x.status === "done").length}/${exTasks.length}`
      : "";
  const manager = !!me?.perms.includes("finance.edit");
  const canDelete = !!me?.perms.includes("projects.delete");
  const canArchive = !!me?.perms.includes("projects.archive");
  const canTeam = !!me?.perms.includes("team.view") && !!me?.perms.includes("projects.edit");
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
  // Status changes from the badge, applied optimistically so it updates instantly.
  const setStatus = async (status: string) => {
    const key = projectKeys.detail(id);
    const prev = qc.getQueryData(key);
    qc.setQueryData(key, { ...q.data, project: { ...p, status } });
    try {
      await updateProject(id, { status: status as ProjectStatus });
      await refresh();
    } catch {
      qc.setQueryData(key, prev);
      setError("تعذّر تغيير الحالة");
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("?")[0] ?? "");
      setError(null);
    } catch {
      setError("تعذّر نسخ الرابط");
    }
  };
  const exportEntries = () => {
    const fin = qc.getQueryData<Finance>(financeKey(p.id));
    if (fin) exportCsv(fin);
  };
  const menu: MenuItem[] = [
    { section: "المشروع" },
    { label: "تعديل بيانات المشروع", icon: <Pencil />, onSelect: () => setEditing(true) },
    { label: "نسخ رابط المشروع", icon: <Link2 />, onSelect: copyLink },
    ...(canTeam
      ? [{ label: "فريق المشروع", icon: <Users />, onSelect: () => setMembers(true) }]
      : []),
    { section: "المالية" },
    {
      label: manager ? "إعدادات العقد والميزانية" : "شروط العقد والميزانية",
      hint: manager ? "القيمة، الضريبة، الأتعاب، التصنيفات" : "للاطلاع",
      icon: <Settings2 />,
      onSelect: () => setSettings(true),
    },
    ...(manager
      ? [
          {
            label: "تسجيل بنود الاتفاقية",
            icon: <FileCheck2 />,
            onSelect: () => setAdding("agreement"),
          },
        ]
      : []),
    {
      label: "التقرير المالي للعميل",
      hint: "كشف المعاملات · PDF",
      icon: <FileText />,
      onSelect: () =>
        navigate({
          to: "/print/finance/$projectId",
          params: { projectId: p.id },
          search: { mode: "client" },
        }),
    },
    ...(manager
      ? [
          {
            label: "التقرير المالي التفصيلي",
            hint: "الأرباح، تقرير الاتفاقية، الميزانية",
            icon: <FileBarChart2 />,
            onSelect: () =>
              navigate({
                to: "/print/finance/$projectId",
                params: { projectId: p.id },
                search: { mode: "detailed" },
              }),
          },
        ]
      : []),
    { label: "تصدير المعاملات (Excel)", icon: <Download />, onSelect: exportEntries },
    ...(canArchive || canDelete ? (["separator"] as MenuItem[]) : []),
    ...(canArchive
      ? [
          p.archivedAt
            ? {
                label: "استعادة المشروع",
                icon: <ArchiveRestore />,
                onSelect: () => act(() => archiveProject(p.id, true)),
              }
            : {
                label: "أرشفة المشروع",
                icon: <Archive />,
                hint: "يُخفى ويمكن استعادته",
                onSelect: () => act(() => archiveProject(p.id)),
              },
        ]
      : []),
    ...(canDelete
      ? [
          {
            label: "حذف نهائي",
            icon: <Trash2 />,
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
      {/* ── Header ───────────────────────────────────────────── */}
      <nav aria-label="مسار التنقل" className="mb-3 text-sm text-muted">
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
      </nav>
      {error && <Notice>{error}</Notice>}
      {p.archivedAt && (
        <Notice tone="amber">هذا المشروع مؤرشف منذ {fromEpoch(p.archivedAt)}.</Notice>
      )}

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{p.name}</h1>
            <BadgeMenu
              tone={STATUS_TONE[p.status] ?? "gray"}
              label={label(PROJECT_STATUS_LABELS, p.status)}
              disabled={!!p.archivedAt}
              onSelect={setStatus}
              options={Object.entries(PROJECT_STATUS_LABELS)
                .filter(([k]) => k !== p.status)
                .map(([k, l]) => ({ value: k, label: l, tone: STATUS_TONE[k] ?? "gray" }))}
            />
            {p.visibility === "private" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Lock className="size-3" /> خاص
              </span>
            )}
          </div>
          {client && (
            <Link
              to="/clients/$id"
              params={{ id: client.id }}
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
            >
              <Avatar name={client.name} logo={client.logoUrl} size="xs" />
              {client.name}
            </Link>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span dir="ltr">{p.number}</span>
            <span>{label(PROJECT_TYPE_LABELS, p.type)}</span>
            {service && (
              <Link
                to="/projects"
                search={{ product: service.productId }}
                className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand hover:underline"
                title="مشاريع هذه الخدمة"
              >
                {service.productName}
                {service.packageName && ` · ${service.packageName}`}
              </Link>
            )}
            {(p.startDate || p.endDate) && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {day(p.startDate) || "—"} ← {day(p.endDate) || "مفتوح"}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {manager && section === "finance" && !p.archivedAt && (
            <Button onClick={() => setAdding("new")}>
              <Plus className="size-4" /> قيد جديد
            </Button>
          )}
          <Menu items={menu} label="إجراءات المشروع" />
        </div>
      </header>

      <ProjectPulse
        projectId={p.id}
        status={p.status}
        endDate={p.endDate}
        onExecution={() => nav({ search: { view: "execution" }, replace: true })}
      />

      <FinanceStrip
        projectId={p.id}
        canEdit={manager}
        isOwner={canDelete}
        fromV1={p.createdBy.startsWith("v1-import") && !q.data.financeImported}
        onSettings={() => setSettings(true)}
        onRegister={() => setAdding("agreement")}
      />

      {/* ── Work area + context column ───────────────────────── */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Segmented<Section>
            label="أقسام المشروع"
            value={section}
            onChange={(v) =>
              nav({ search: { view: v === "finance" ? undefined : v }, replace: true })
            }
            items={[
              { value: "finance", label: "المالية", icon: <Wallet className="size-4" /> },
              {
                value: "documents",
                label: docCount ? `المستندات (${docCount})` : "المستندات",
                icon: <FileText className="size-4" />,
                hint: "العقود والخطابات",
              },
              {
                value: "execution",
                label: workLabel ? `التنفيذ (${workLabel})` : "التنفيذ",
                icon: <ListChecks className="size-4" />,
                hint: "المراحل والمهام والوقت",
              },
            ]}
          />
          {section === "finance" ? (
            <Transactions
              projectId={p.id}
              canEdit={manager}
              adding={adding}
              setAdding={setAdding}
            />
          ) : section === "documents" ? (
            <DocumentsSection projectId={p.id} canEdit={manager} />
          ) : (
            <ExecutionTab projectId={p.id} />
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24" aria-label="تفاصيل المشروع">
          <ContractSummary
            projectId={p.id}
            canEdit={manager}
            onSettings={() => setSettings(true)}
          />
          <ReceiptsCard projectId={p.id} canEdit={manager} />
          <ScheduleCard projectId={p.id} canEdit={manager} />
          {/* On a phone the details come first; on a computer they close the column. */}
          <Card className="order-first lg:order-none">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">بيانات المشروع</h2>
              <Button
                variant="ghost"
                onClick={() => setEditing(true)}
                className="px-2 py-1 text-xs"
              >
                <Pencil className="size-3.5" /> تعديل
              </Button>
            </div>
            <dl className="space-y-2.5 text-sm">
              <Detail label="النوع" value={label(PROJECT_TYPE_LABELS, p.type)} />
              {service && (
                <Detail
                  label="الخدمة"
                  value={`${service.productName}${service.packageName ? ` · ${service.packageName}` : ""}`}
                />
              )}
              <Detail label="الموقع" value={p.location} icon={<MapPin className="size-3.5" />} />
              <Detail label="البداية" value={day(p.startDate)} />
              <Detail label="الانتهاء المتوقع" value={day(p.endDate)} />
              <Detail label="استلام الدفعة" value={day(p.payDate)} />
              <Detail label="الظهور" value={p.visibility === "private" ? "خاص" : "الفريق"} />
            </dl>
            {p.notes && (
              <p className="mt-4 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{p.notes}</p>
            )}
            <p className="mt-4 border-t pt-3 text-xs text-muted">
              أُضيف {fromEpoch(p.createdAt)} · آخر تعديل {fromEpoch(p.updatedAt)}
            </p>
          </Card>
        </aside>
      </div>

      <FinanceSettings
        projectId={p.id}
        open={settings}
        onOpenChange={setSettings}
        canEdit={manager}
      />
      <ProjectDialog open={editing} onOpenChange={setEditing} existing={q.data} />
      <ProjectMembers projectId={p.id} open={members} onClose={() => setMembers(false)} />
    </>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="inline-flex items-center gap-1 text-left">
        {value ? (
          <>
            {icon}
            {value}
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <div aria-busy className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}
