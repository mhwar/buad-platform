import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card } from "../../components/ui";
import { sar } from "../../lib/format";
import { yearReviewQuery } from "./api";

/**
 * The year's revenue against its target — the figure the owner opens the platform for.
 * Same measure as the plan's indicator (with VAT, approved receipts and the company's income).
 */
export function YearTargetCard({
  year = new Date().getFullYear(),
  actions,
  compact = false,
}: {
  year?: number;
  /** Buttons beside the figure (on «اليوم»: record a receipt, open the review). */
  actions?: ReactNode;
  compact?: boolean;
}) {
  const q = useQuery(yearReviewQuery(year));
  const t = q.data?.totals;
  if (!t) return q.isPending ? <Card className="h-32 animate-pulse" aria-busy /> : null;
  const pct = t.target ? Math.min(100, Math.round((t.revenue / t.target) * 1000) / 10) : null;
  return (
    <Card className="space-y-3" aria-label="الإيراد مقابل المستهدف">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">المحقق في {year}</p>
          <p
            className={
              compact ? "text-2xl font-bold tabular-nums" : "text-3xl font-bold tabular-nums"
            }
          >
            {sar(t.revenue)}
          </p>
          {t.target ? (
            <p className="text-sm text-muted">
              من مستهدف <b className="text-ink">{sar(t.target)}</b> ·{" "}
              <b className="text-ink">{pct}%</b> · المتبقي{" "}
              <b className="text-ink">{sar(Math.max(0, t.target - t.revenue))}</b>
            </p>
          ) : (
            <p className="text-sm text-muted">لا مستهدف إيراد في خطة {year}.</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {pct !== null && (
        <div
          role="progressbar"
          aria-label="نسبة تحقيق المستهدف"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!compact && (
        <p className="text-xs text-muted">
          شاملة الضريبة: المقبوضات المسجّلة من العملاء ودخل الشركة، بتاريخ وصولها. هو نفس رقم مؤشر
          «الإيرادات المحصّلة» في الخطة.
        </p>
      )}
    </Card>
  );
}
