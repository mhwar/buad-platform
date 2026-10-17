import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  FileSpreadsheet,
  Percent,
  PieChart,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { FilterBar } from "../../components/FilterBar";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Pills,
  Segmented,
  Select,
} from "../../components/ui";
import { day, pct, sar } from "../../lib/format";
import { financeApi } from "../finance/api";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import { ReceivablesPage } from "../receivables/ReceivablesPage";
import { YearReview } from "../year-review/YearReview";
import {
  type Overview,
  type OverviewProject,
  overviewQuery,
  type Period,
  type PeriodChoice,
  resolvePeriod,
} from "./api";
import { downloadArchive } from "./archive";
import { CompanyTab } from "./CompanyTab";
import { MonthlyBars, RankBars } from "./charts";
import { PartnersTab } from "./PartnersTab";
import { PeriodPicker } from "./PeriodPicker";
import { QuarterCentre } from "./QuarterCentre";
import { Tile } from "./Tile";
import { VatTab } from "./VatTab";

const route = getRouteApi("/finance");
type SortKey = "profit" | "margin" | "gross";
type Tab = "projects" | "review" | "quarter" | "vat" | "company" | "partners" | "receivables";

/** «المالية»: the organisation's money at a glance, then the detail behind every number. */
export function FinancePage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const choice: PeriodChoice = { preset: s.preset, year: s.year, q: s.q, from: s.from, to: s.to };
  const r = resolvePeriod(choice);
  const filters = { client: s.client, status: s.status };
  const period: Period = { ...r.period, ...filters };
  const tab: Tab = s.tab ?? "projects";
  const q = useQuery({ ...overviewQuery(period), enabled: tab === "projects" });
  // The previous quarter/year, for ▲▼ on the headline numbers.
  const prevQ = useQuery({
    ...overviewQuery({ ...(r.prev ?? {}), ...filters }),
    enabled: tab === "projects" && !!r.prev,
  });
  const clients = useQuery({ ...overviewQuery({}), enabled: tab === "projects" });
  const clientOptions = [
    ...new Map((clients.data?.projects ?? []).map((p) => [p.clientId, p.clientName])).entries(),
  ];
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const [sort, setSort] = useState<SortKey>("profit");

  const [archive, setArchive] = useState(false);
  const reportLink = (
    <>
      <Button
        variant="secondary"
        className="hidden sm:inline-flex"
        onClick={() => setArchive(true)}
      >
        <FileSpreadsheet className="size-4" /> أرشيف Excel
      </Button>
      <Link
        to="/finance/report"
        search={{ from: period.from, to: period.to }}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong dark:text-canvas"
      >
        <FileBarChart2 className="size-4" /> التقرير المالي
      </Link>
    </>
  );

  return (
    <>
      <PageHeader
        title="المالية"
        subtitle="عقود الجهة وأرباحها ومصروفاتها والتزاماتها، ومالية الشركة والشركاء"
        actions={reportLink}
        moreActions={[
          {
            label: "أرشيف Excel",
            hint: "كل المشاريع والقيود",
            icon: <FileSpreadsheet />,
            onSelect: () => setArchive(true),
          },
        ]}
      />
      <div className="mb-4 max-w-3xl lg:hidden">
        <Segmented<Tab>
          label="أقسام المالية"
          value={tab}
          onChange={(v) => set({ tab: v === "projects" ? undefined : v })}
          items={[
            { value: "projects", label: "المشاريع", icon: <Briefcase className="size-4" /> },
            { value: "review", label: "مراجعة السنة", icon: <ClipboardCheck className="size-4" /> },
            { value: "quarter", label: "توزيع الربع", icon: <PieChart className="size-4" /> },
            { value: "vat", label: "الضريبة", icon: <Percent className="size-4" /> },
            { value: "company", label: "الشركة", icon: <Building2 className="size-4" /> },
            { value: "partners", label: "الشركاء والتوزيع", icon: <Users className="size-4" /> },
            { value: "receivables", label: "التحصيل والتدفق", icon: <Wallet className="size-4" /> },
          ]}
        />
      </div>
      <div
        className={`mb-6 flex flex-wrap items-center gap-3 ${tab === "partners" || tab === "quarter" || tab === "vat" || tab === "receivables" || tab === "review" ? "hidden" : ""}`}
      >
        <FilterBar
          leading={
            <PeriodPicker
              value={choice}
              onChange={(c) =>
                set({ preset: c.preset, year: c.year, q: c.q, from: c.from, to: c.to })
              }
            />
          }
          fields={
            tab === "projects"
              ? [
                  {
                    key: "client",
                    label: "العميل",
                    value: s.client ?? "",
                    allLabel: "كل العملاء",
                    options: clientOptions.map(([id, name]) => ({ value: id, label: name })),
                  },
                  {
                    key: "status",
                    label: "الحالة",
                    value: s.status ?? "",
                    allLabel: "كل الحالات",
                    options: Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) => ({
                      value: k,
                      label: l,
                    })),
                  },
                ]
              : []
          }
          onChange={(k, v) => set({ [k]: v || undefined })}
        />
      </div>

      {archive && <ArchiveDialog onClose={() => setArchive(false)} />}
      {tab === "review" ? (
        <YearReview
          year={s.year ?? new Date().getFullYear()}
          onYear={(y) => set({ year: y === new Date().getFullYear() ? undefined : y })}
        />
      ) : tab === "vat" ? (
        <VatTab />
      ) : tab === "quarter" ? (
        <QuarterCentre />
      ) : tab === "company" ? (
        <CompanyTab period={period} />
      ) : tab === "receivables" ? (
        <ReceivablesPage />
      ) : tab === "partners" ? (
        <PartnersTab />
      ) : q.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ) : q.isError || !q.data ? (
        <EmptyState
          title="تعذّر تحميل المالية"
          action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>}
        />
      ) : q.data.totals.projects === 0 ? (
        <EmptyState
          title="لا مشاريع في هذه الفترة"
          text="يدخل المشروع الفترة بتاريخ أول مبلغ استُلم منه (أو تاريخ عقده أو بدايته). جرّبوا «كل الفترات»."
        />
      ) : (
        <Dashboard
          data={q.data}
          prev={r.prev ? prevQ.data : undefined}
          prevLabel={r.prevLabel}
          sort={sort}
          setSort={setSort}
        />
      )}
    </>
  );
}

function Dashboard({
  data,
  prev,
  prevLabel,
  sort,
  setSort,
}: {
  data: Overview;
  prev?: Overview;
  prevLabel?: string;
  sort: SortKey;
  setSort: (k: SortKey) => void;
}) {
  const t = data.totals;
  const sorted = [...data.projects].sort((a, b) => b[sort] - a[sort]);
  const obligations = data.obligations.pending.length + data.obligations.unregistered.length;
  return (
    <div className="space-y-6">
      {data.quality.length > 0 && <QualityCard items={data.quality} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title="قيمة العقود (شامل الضريبة)"
          value={sar(t.gross)}
          sub={`${t.projects} مشروع · ضريبة ${sar(t.vat)}${t.withoutFinance ? ` · ${t.withoutFinance} بلا مالية` : ""}`}
          delta={prev && { now: t.gross, prev: prev.totals.gross, label: prevLabel }}
        />
        <Tile
          title="صافي الربح"
          value={sar(t.profit)}
          sub={`هامش ${pct(t.margin)}`}
          tone={t.profit > 0 ? "good" : undefined}
          delta={prev && { now: t.profit, prev: prev.totals.profit, label: prevLabel }}
        />
        <Tile
          title="المستلم من العملاء"
          value={sar(t.received)}
          sub="بتاريخ وصوله للبنك"
          delta={prev && { now: t.received, prev: prev.totals.received, label: prevLabel }}
        />
        <Tile
          title="المصروفات"
          value={sar(t.spent)}
          delta={
            prev && { now: t.spent, prev: prev.totals.spent, label: prevLabel, lowerIsBetter: true }
          }
        />
        <Tile
          title="المتبقي من العقود"
          value={sar(t.remaining)}
          tone={t.remaining < 0 ? "bad" : undefined}
        />
        <Tile
          title="التزامات قائمة"
          value={sar(t.pending + t.unregistered)}
          sub={`${obligations} بند`}
          tone={obligations ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-3 font-semibold">الحركة الشهرية</h2>
          <MonthlyBars data={data.monthly} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">المصروفات حسب التصنيف</h2>
          <RankBars data={data.categories.slice(0, 8)} color="var(--color-series-2)" />
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="font-semibold">ربحية المشاريع</h2>
          <Pills<SortKey>
            value={sort}
            onChange={(v) => setSort((v || "profit") as SortKey)}
            items={[
              { value: "profit", label: "حسب الربح" },
              { value: "margin", label: "حسب الهامش" },
              { value: "gross", label: "حسب القيمة" },
            ]}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y text-right text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">المشروع</th>
                <th className="p-3 font-medium">العميل</th>
                <th className="p-3 font-medium">قيمة العقد</th>
                <th className="p-3 font-medium">المصروف</th>
                <th className="p-3 font-medium">صافي الربح</th>
                <th className="p-3 font-medium">الهامش</th>
                <th className="p-3 font-medium">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <ProjectRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">العملاء حسب قيمة العقود</h2>
          <RankBars
            data={data.clients.slice(0, 8).map((c) => ({ label: c.name, amount: c.gross }))}
          />
        </Card>
        <Card className="xl:col-span-2">
          <h2 className="mb-1 font-semibold">الالتزامات والمستحقات</h2>
          <p className="mb-4 text-xs text-muted">
            قيود معلّقة لم تُدفع، وبنود في الاتفاقية لم تُسجَّل في مالية مشروعها بعد.
          </p>
          {obligations === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا التزامات قائمة ✓</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {data.obligations.unregistered.map((u) => (
                <li key={`${u.projectId}-${u.item}`} className="flex items-center gap-3 p-3">
                  <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{u.item}</span> غير مسجّل ·{" "}
                    <FinanceLink id={u.projectId} name={u.projectName} />
                  </span>
                  <span className="font-semibold">{sar(u.amount)}</span>
                </li>
              ))}
              {data.obligations.pending.map((p, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: entries listed once
                <li key={i} className="flex items-center gap-3 p-3">
                  <Badge tone="amber">معلّق</Badge>
                  <span className="min-w-0 flex-1">
                    {p.description} · <FinanceLink id={p.projectId} name={p.projectName} />
                    <span className="block text-xs text-muted">{day(p.date)}</span>
                  </span>
                  <span className="font-semibold">{sar(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function FinanceLink({ id, name }: { id: string; name: string }) {
  return (
    <Link
      to="/projects/$id"
      params={{ id }}
      search={{ view: "finance" }}
      className="text-brand hover:underline"
    >
      {name}
    </Link>
  );
}

function ProjectRow({ p }: { p: OverviewProject }) {
  return (
    <tr className="border-b last:border-0 hover:bg-brand-soft/50">
      <td className="p-3">
        <FinanceLink id={p.id} name={p.name} />
        <span className="block text-xs text-muted">
          <span dir="ltr">{p.number}</span> · {label(PROJECT_STATUS_LABELS, p.status)}
          {!p.hasFinance && <span className="text-amber-700"> · بلا مالية</span>}
        </span>
      </td>
      <td className="p-3">{p.clientName}</td>
      <td className="p-3 whitespace-nowrap">{sar(p.gross)}</td>
      <td className="p-3 whitespace-nowrap">{sar(p.spent)}</td>
      <td className="p-3 whitespace-nowrap font-semibold">{sar(p.profit)}</td>
      <td className="p-3 whitespace-nowrap">{pct(p.margin)}</td>
      <td
        className={`p-3 whitespace-nowrap ${p.remaining < 0 ? "text-red-600 dark:text-red-400" : ""}`}
      >
        {sar(p.remaining)}
      </td>
    </tr>
  );
}

/** «بيانات ناقصة»: what to complete so periods and statuses are right — fixable in place. */
function QualityCard({ items }: { items: Overview["quality"] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dates = items.filter((i) => i.missingReceipts).length;
  const statuses = items.reduce((a, i) => a + i.entriesWithoutStatus, 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["finance-overview"] });
  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">بيانات ناقصة تؤثر على دقة الأرقام</p>
            <p className={`text-xs text-muted ${open ? "" : "line-clamp-2 sm:line-clamp-none"}`}>
              {dates > 0 &&
                `${dates} مشروع لم يُسجَّل له أي مبلغ مستلم (لا يُعرف ربعه ولا يدخل في التوزيع)`}
              {dates > 0 && statuses > 0 && " · "}
              {statuses > 0 && `${statuses} قيد بلا حالة (مدفوع/معلّق)`}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="min-h-11 sm:min-h-0"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "إخفاء" : "إكمال الآن"}
        </Button>
      </div>
      {open && (
        <ul className="mt-4 divide-y rounded-lg border bg-surface text-sm">
          {items.map((i) => (
            <QualityRow key={i.projectId} item={i} onDone={refresh} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function QualityRow({
  item: i,
  onDone,
}: {
  item: Overview["quality"][number];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const api = financeApi(i.projectId);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onDone();
    } catch {
      setErr("تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <span className="min-w-0 flex-1">
        <FinanceLink id={i.projectId} name={i.name} />
        <span className="block text-xs text-muted" dir="ltr">
          {i.number}
        </span>
      </span>
      {i.missingReceipts && (
        <Link
          to="/finance"
          search={{ tab: "quarter" }}
          className="inline-flex items-center rounded-lg border bg-surface px-3 py-2 text-sm font-semibold transition hover:bg-brand-soft"
        >
          راجعوا مقترح الاستلام واعتمدوه
        </Link>
      )}
      {i.entriesWithoutStatus > 0 && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => run(() => api.markUnsetStatus("paid"))}
        >
          اعتبار {i.entriesWithoutStatus} قيد مدفوعة
        </Button>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </li>
  );
}

/** «أرشيف Excel»: choose projects (finished ones by default) → one .xlsx workbook. */
function ArchiveDialog({ onClose }: { onClose: () => void }) {
  const q = useQuery(overviewQuery({}));
  const all = q.data?.projects ?? [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen =
    picked ??
    all.filter((p) => p.status === "completed" || p.status === "cancelled").map((p) => p.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="أرشيف Excel للمشاريع">
      <p className="mb-3 text-sm text-muted">
        ملف واحد: ورقة ملخص، ثم ورقة لكل مشروع فيها العقد وتقرير الاتفاقية وكل المعاملات.
      </p>
      {err && <Notice>{err}</Notice>}
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
        {all.map((p) => (
          <label
            key={p.id}
            className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-brand-soft/50"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(p.id)}
                onChange={(e) =>
                  setPicked(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))
                }
              />
              {p.name}
            </span>
            <span className="text-xs text-muted">{label(PROJECT_STATUS_LABELS, p.status)}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!chosen.length || busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await downloadArchive(all.filter((p) => chosen.includes(p.id)));
              onClose();
            } catch {
              setErr("تعذّر تجهيز الملف");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "جارٍ التجهيز…" : `تنزيل (${chosen.length} مشروع)`}
        </Button>
      </div>
    </Dialog>
  );
}
