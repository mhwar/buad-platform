import { REVIEW_FLAG_HINT, REVIEW_FLAG_LABEL, REVIEW_FLAGS, type ReviewFlag } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Wallet } from "lucide-react";
import { useState } from "react";
import { SkeletonGrid } from "../../components/Resilience";
import { StatTile } from "../../components/StatTile";
import {
  Badge,
  Button,
  Card,
  confirmAction,
  cx,
  Dialog,
  EmptyState,
  Notice,
  Segmented,
} from "../../components/ui";
import { exportTable } from "../../lib/export";
import { day, sar } from "../../lib/format";
import { useCan } from "../../session";
import { label, PROJECT_STATUS_LABELS, STATUS_TONE } from "../labels";
import { updateProject } from "../projects/api";
import { ReceiptFlow } from "../receivables/ReceiptFlow";
import { type ReviewItem, yearReviewQuery } from "./api";
import { YearTargetCard } from "./YearTargetCard";

type Show = "review" | ReviewFlag | "all";
const FLAG_TONE: Record<ReviewFlag, "red" | "amber" | "blue" | "gray"> = {
  closed_not_paid: "red",
  paid_not_closed: "blue",
  overdue: "red",
  no_receipts: "amber",
  no_contract: "gray",
};

/**
 * «مراجعة السنة»: the year's revenue (with VAT, as the plan measures it) against its target,
 * and every project to check before the figure can be trusted — each fixed from right here.
 */
export function YearReview({ year, onYear }: { year: number; onYear: (y: number) => void }) {
  const can = useCan();
  const edit = can("finance.edit");
  const qc = useQueryClient();
  const q = useQuery(yearReviewQuery(year));
  const [show, setShow] = useState<Show>("review");
  const [receipt, setReceipt] = useState<ReviewItem | null>(null);
  const [error, setError] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["year-review"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["plans"] });
  };
  const close = async (p: ReviewItem) => {
    if (
      !(await confirmAction({
        title: `إغلاق «${p.name}» كمكتمل؟`,
        text: "يُنقل إلى المشاريع المكتملة، ويمكن إعادة فتحه لاحقاً.",
        action: "إغلاق كمكتمل",
      }))
    )
      return;
    setError("");
    try {
      await updateProject(p.id, { status: "completed" });
      refresh();
    } catch {
      setError("تعذّر إغلاق المشروع.");
    }
  };

  const d = q.data;
  const all = d?.items ?? [];
  const flagged = all.filter((i) => i.flags.length);
  const shown =
    show === "all" ? all : show === "review" ? flagged : all.filter((i) => i.flags.includes(show));
  const t = d?.totals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="السنة">
          <Button variant="ghost" aria-label="السنة السابقة" onClick={() => onYear(year - 1)}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="min-w-16 text-center text-lg font-bold tabular-nums">{year}</h2>
          <Button variant="ghost" aria-label="السنة التالية" onClick={() => onYear(year + 1)}>
            <ChevronLeft className="size-4" />
          </Button>
        </div>
        {all.length > 0 && (
          <Button
            variant="secondary"
            onClick={() =>
              exportTable(
                `مراجعة ${year}`,
                [
                  { header: "رقم المشروع", value: (r) => r.number },
                  { header: "المشروع", value: (r) => r.name },
                  { header: "العميل", value: (r) => r.clientName },
                  { header: "الحالة", value: (r) => label(PROJECT_STATUS_LABELS, r.status) },
                  { header: "قيمة العقد شاملة الضريبة", value: (r) => r.gross, money: true },
                  { header: "المستلم", value: (r) => r.received, money: true },
                  { header: `المستلم في ${year}`, value: (r) => r.receivedYear, money: true },
                  { header: "المتبقي", value: (r) => r.remaining, money: true },
                  { header: "آخر استلام", value: (r) => r.lastReceipt },
                  {
                    header: "يحتاج مراجعة",
                    value: (r) => r.flags.map((f) => REVIEW_FLAG_LABEL[f]).join("، "),
                  },
                ],
                all,
                "xlsx",
                `year-review-${year}`,
              )
            }
          >
            <Download className="size-4" /> Excel
          </Button>
        )}
      </div>

      {q.isPending && <SkeletonGrid count={4} className="h-28" label="جارٍ تحميل مراجعة السنة" />}
      {q.isError && <EmptyState title="تعذّر تحميل مراجعة السنة" />}
      {t && (
        <>
          <YearTargetCard year={year} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="مقبوضات المشاريع"
              value={sar(t.projectReceipts)}
              hint={`منها ضريبة ${sar(t.receiptsVat)}`}
            />
            <StatTile label="دخل الشركة" value={sar(t.companyIncome)} hint="خدمات وإيرادات أخرى" />
            <StatTile
              label="محتمل غير مسجّل"
              value={sar(t.unrecorded)}
              hint="متبقٍّ على مشاريع مكتملة"
              tone={t.unrecorded > 0 ? "warn" : undefined}
            />
            <StatTile label="قيد التحصيل" value={sar(t.collecting)} hint="متبقٍّ على مشاريع جارية" />
          </div>
        </>
      )}

      {d && (
        <section aria-label="المشاريع للمراجعة" className="space-y-3">
          <Segmented<Show>
            label="عرض المشاريع"
            value={show}
            onChange={setShow}
            items={[
              { value: "review", label: `تحتاج مراجعة (${flagged.length})` },
              ...REVIEW_FLAGS.filter((f) => d.counts[f]).map((f) => ({
                value: f,
                label: `${REVIEW_FLAG_LABEL[f]} (${d.counts[f]})`,
                hint: REVIEW_FLAG_HINT[f],
              })),
              { value: "all", label: `الكل (${all.length})` },
            ]}
          />
          {show !== "review" && show !== "all" && (
            <p className="text-sm text-muted">{REVIEW_FLAG_HINT[show]}</p>
          )}
          {error && <Notice>{error}</Notice>}
          {shown.length === 0 && (
            <EmptyState
              title={show === "review" ? "كل مشاريع السنة مرتّبة ✓" : "لا مشاريع هنا"}
              text={show === "review" ? "لا مشروع يحتاج مراجعة لرقم الإيراد." : undefined}
            />
          )}
          <ul className="grid gap-3 lg:grid-cols-2">
            {shown.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to="/projects/$id"
                        params={{ id: p.id }}
                        className="font-semibold hover:text-brand"
                      >
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted">
                        <span dir="ltr">{p.number}</span> · {p.clientName}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[p.status] ?? "gray"}>
                      {label(PROJECT_STATUS_LABELS, p.status)}
                    </Badge>
                  </div>
                  {p.flags.length > 0 && (
                    <p className="flex flex-wrap gap-1.5">
                      {p.flags.map((f) => (
                        <Badge key={f} tone={FLAG_TONE[f]}>
                          {REVIEW_FLAG_LABEL[f]}
                        </Badge>
                      ))}
                    </p>
                  )}
                  <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                    <Fig label={p.estimated ? "العقد (تقديري)" : "العقد"} value={sar(p.gross)} />
                    <Fig label="المستلم" value={sar(p.received)} />
                    <Fig
                      label="المتبقي"
                      value={sar(p.remaining)}
                      strong={p.remaining > 0 && p.status === "completed"}
                    />
                  </dl>
                  <p className="text-xs text-muted">
                    {p.lastReceipt ? `آخر استلام ${day(p.lastReceipt)}` : "لا استلامات"}
                    {p.receivedYear > 0 && ` · في ${year}: ${sar(p.receivedYear)}`}
                  </p>
                  {edit && (
                    <div className="mt-auto flex flex-wrap gap-2">
                      {p.remaining > 0 && (
                        <Button onClick={() => setReceipt(p)}>
                          <Wallet className="size-4" /> تسجيل مقبوض
                        </Button>
                      )}
                      {(p.status === "active" || p.status === "paused") && (
                        <Button
                          variant={p.flags.includes("paid_not_closed") ? "primary" : "secondary"}
                          onClick={() => close(p)}
                        >
                          <CheckCircle2 className="size-4" /> إغلاق كمكتمل
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {receipt && (
        <ReceiptFlow
          project={{
            id: receipt.id,
            name: receipt.name,
            remaining: receipt.remaining,
            contractDate: receipt.contractDate,
          }}
          onClose={() => setReceipt(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-canvas/60 px-2 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx("font-semibold tabular-nums", strong && "text-red-600")}>{value}</dd>
    </div>
  );
}
