import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { AlertTriangle, FileBarChart2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Pills } from "../../components/ui";
import { day, pct, sar } from "../../lib/format";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import {
  type Overview,
  type OverviewProject,
  overviewQuery,
  type Period,
  presetPeriod,
} from "./api";
import { MonthlyBars, RankBars } from "./charts";

const route = getRouteApi("/finance");
type Preset = "all" | "year" | "last" | "custom";
type SortKey = "profit" | "margin" | "gross";

/** «المالية»: the organisation's money at a glance, then the detail behind every number. */
export function FinancePage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const preset: Preset = (s.preset as Preset) ?? "all";
  const period: Period = preset === "custom" ? { from: s.from, to: s.to } : presetPeriod(preset);
  const q = useQuery(overviewQuery(period));
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const [sort, setSort] = useState<SortKey>("profit");

  const reportLink = (
    <Link
      to="/finance/report"
      search={{ from: period.from, to: period.to }}
      className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong dark:text-canvas"
    >
      <FileBarChart2 className="size-4" /> التقرير المالي
    </Link>
  );

  return (
    <>
      <PageHeader
        title="المالية"
        subtitle="عقود الجهة وأرباحها ومصروفاتها والتزاماتها، من مالية كل مشروع"
        actions={reportLink}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Pills<Preset>
          value={preset}
          onChange={(v) => set({ preset: (v || "all") as Preset })}
          items={[
            { value: "all", label: "كل الفترات" },
            { value: "year", label: "هذه السنة" },
            { value: "last", label: "السنة الماضية" },
            { value: "custom", label: "فترة مخصصة" },
          ]}
        />
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="من"
              value={s.from ?? ""}
              onChange={(e) => set({ from: e.target.value || undefined })}
              className="w-auto"
            />
            <span className="text-muted">إلى</span>
            <Input
              type="date"
              aria-label="إلى"
              value={s.to ?? ""}
              onChange={(e) => set({ to: e.target.value || undefined })}
              className="w-auto"
            />
          </div>
        )}
      </div>

      {q.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ) : q.isError || !q.data ? (
        <EmptyState
          title="تعذّر تحميل المالية"
          action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>}
        />
      ) : q.data.totals.projects === 0 ? (
        <EmptyState
          title="لا مشاريع في هذه الفترة"
          text="تُحسب المشاريع بتاريخ عقدها (أو تاريخ بدايتها). جرّبوا «كل الفترات»."
        />
      ) : (
        <Dashboard data={q.data} sort={sort} setSort={setSort} />
      )}
    </>
  );
}

function Tile({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{title}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-400"
            : tone === "bad"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function Dashboard({
  data,
  sort,
  setSort,
}: {
  data: Overview;
  sort: SortKey;
  setSort: (k: SortKey) => void;
}) {
  const t = data.totals;
  const sorted = [...data.projects].sort((a, b) => b[sort] - a[sort]);
  const obligations = data.obligations.pending.length + data.obligations.unregistered.length;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title="قيمة العقود (شامل الضريبة)"
          value={sar(t.gross)}
          sub={`${t.projects} مشروع${t.withoutFinance ? ` · ${t.withoutFinance} بلا مالية` : ""}`}
        />
        <Tile
          title="صافي الربح"
          value={sar(t.profit)}
          sub={`هامش ${pct(t.margin)}`}
          tone={t.profit > 0 ? "good" : undefined}
        />
        <Tile title="المصروفات" value={sar(t.spent)} />
        <Tile
          title="المتبقي من العقود"
          value={sar(t.remaining)}
          tone={t.remaining < 0 ? "bad" : undefined}
        />
        <Tile title="ضريبة القيمة المضافة" value={sar(t.vat)} sub="على العقود" />
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
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
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
