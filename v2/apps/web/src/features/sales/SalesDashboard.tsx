import { SOURCE_LABEL, type Source } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, EmptyState } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { RankBars } from "../finance-overview/charts";
import { REQUEST_LABEL, type RequestStatus } from "../products/products-api";
import { overviewQuery } from "./api";
import { SalesCrumb } from "./SalesCrumb";
import { WonBars } from "./WonBars";

const Tile = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "good";
}) => (
  <Card className="p-4">
    <p className="text-xs text-muted">{label}</p>
    <p
      className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : ""}`}
    >
      {value}
    </p>
    {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
  </Card>
);

const Panel = ({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <Card className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold">{title}</h2>
      {action}
    </div>
    {children}
  </Card>
);

/** «لوحة المبيعات»: where the pipeline stands, how the closed ones went, and what needs doing today. */
export function SalesDashboard() {
  const q = useQuery(overviewQuery);
  if (!q.data) return <Card className="h-48 animate-pulse" aria-busy />;
  const o = q.data;
  const due = o.followups.leadsDue + o.followups.clientsDue;
  const maxCount = Math.max(1, ...o.pipeline.stages.map((s) => s.count));
  const empty =
    o.pipeline.open.count === 0 && o.results.won + o.results.lost === 0 && o.quotes.sent === 0;

  return (
    <div className="space-y-6">
      <SalesCrumb title="تحليلات المبيعات" subtitle="القمع والتحويل والمكسوب والعروض والمصادر" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="فرص مفتوحة"
          value={String(o.pipeline.open.count)}
          hint={`${sar(o.pipeline.open.value)} إجمالاً`}
        />
        <Tile
          label="القيمة المرجّحة"
          value={sar(o.pipeline.open.weighted)}
          hint="القيمة × احتمال كل مرحلة"
        />
        <Tile label="المكسوب هذا الربع" value={sar(o.results.wonThisQuarter)} tone="good" />
        <Tile
          label="نسبة التحويل"
          value={o.results.winRate === null ? "—" : `${o.results.winRate}%`}
          hint={`${o.results.won} فازت · ${o.results.lost} خسرت${o.results.avgCycleDays !== null ? ` · ${o.results.avgCycleDays} يوماً للإغلاق` : ""}`}
        />
      </div>

      {empty && (
        <EmptyState
          title="لوحتك فارغة لأنها لا تزال في البداية"
          text="حين تصل الطلبات وتسجّل الفرص والعروض تمتلئ هذه اللوحة بأرقامها الحقيقية."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="قمع الفرص"
          action={
            <Link to="/sales" className="text-sm text-brand underline">
              فتح الفرص
            </Link>
          }
        >
          <ul className="space-y-2">
            {o.pipeline.stages.map((s) => (
              <li key={s.stage}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{REQUEST_LABEL[s.stage as RequestStatus]}</span>
                  <span className="text-muted">
                    {s.count} · {sar(s.value)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="ما يحتاج تصرفاً اليوم">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <Link
                to="/sales/followups"
                className="inline-flex min-h-9 items-center gap-2 hover:text-brand"
              >
                <CalendarClock className="size-4 text-muted" />
                متابعات حان موعدها
              </Link>
              <Badge tone={due ? "amber" : "gray"}>{due}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="size-4 text-muted" />
                فرص راكدة (بلا نشاط أكثر من أسبوع)
              </span>
              <Badge tone={o.stale.length ? "amber" : "gray"}>{o.stale.length}</Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <Link
                to="/sales/quotes"
                className="inline-flex min-h-9 items-center gap-2 hover:text-brand"
              >
                <FileText className="size-4 text-muted" />
                عروض تنتهي خلال 7 أيام
              </Link>
              <Badge tone={o.quotes.expiring.length ? "amber" : "gray"}>
                {o.quotes.expiring.length}
              </Badge>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <FileText className="size-4 text-muted" />
                عروض مرسلة بلا رد منذ أكثر من أسبوع
              </span>
              <Badge tone={o.quotes.waiting.length ? "amber" : "gray"}>
                {o.quotes.waiting.length}
              </Badge>
            </li>
          </ul>
          {o.stale.length > 0 && (
            <div className="border-t pt-2">
              <p className="mb-1 text-xs font-semibold text-muted">الأكثر ركوداً</p>
              <ul className="space-y-1 text-sm">
                {o.stale.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <Link
                      to="/sales/$id"
                      params={{ id: s.id }}
                      className="truncate hover:text-brand hover:underline"
                    >
                      {s.entity || s.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">{s.daysIdle} يوماً</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel
          title="عروض الأسعار"
          action={
            <Link to="/sales/quotes" className="text-sm text-brand underline">
              فتح العروض
            </Link>
          }
        >
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[11px] text-muted">أُرسلت</dt>
              <dd className="font-bold">{o.quotes.sent}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">نسبة القبول</dt>
              <dd className="font-bold">
                {o.quotes.acceptRate === null ? "—" : `${o.quotes.acceptRate}%`}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">متوسط القيمة</dt>
              <dd className="font-bold">{o.quotes.avgValue ? sar(o.quotes.avgValue) : "—"}</dd>
            </div>
          </dl>
          {o.quotes.expiring.length > 0 && (
            <ul className="space-y-1 border-t pt-2 text-sm">
              {o.quotes.expiring.map((x) => (
                <li key={x.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {x.number} · {x.recipient || x.title}
                  </span>
                  <span className="shrink-0 text-xs text-amber-600">ينتهي {day(x.validUntil)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="التحويل حسب المصدر">
          {o.sources.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا طلبات بعد.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="p-1.5 text-start font-medium">المصدر</th>
                  <th className="p-1.5 text-end font-medium">الفرص</th>
                  <th className="p-1.5 text-end font-medium">فازت</th>
                  <th className="p-1.5 text-end font-medium">التحويل</th>
                </tr>
              </thead>
              <tbody>
                {o.sources.map((s) => (
                  <tr key={s.source} className="border-t">
                    <td className="p-1.5">{SOURCE_LABEL[s.source as Source] ?? s.source}</td>
                    <td className="p-1.5 text-end tabular-nums">{s.total}</td>
                    <td className="p-1.5 text-end tabular-nums">{s.won}</td>
                    <td className="p-1.5 text-end tabular-nums">
                      {s.rate === null ? "—" : `${s.rate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="المكسوب شهرياً (آخر 12 شهراً)">
          <WonBars data={o.monthlyWon} />
        </Panel>

        <Panel
          title="أهم العملاء قيمةً"
          action={
            <Link to="/clients" className="text-sm text-brand underline">
              كل العملاء
            </Link>
          }
        >
          <RankBars data={o.topClients.map((c) => ({ label: c.name, amount: c.value }))} />
        </Panel>
      </div>
    </div>
  );
}
