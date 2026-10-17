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
import { ReceiptDialog } from "../finance/Receipts";
import { label, PROJECT_STATUS_LABELS, STATUS_TONE } from "../labels";
import { updateProject } from "../projects/api";
import { scheduleQuery } from "../receivables/api";
import { ReceiveDialog } from "../receivables/ReceiveDialog";
import { type ReviewItem, yearReviewQuery } from "./api";

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
  const [lines, setLines] = useState<ReviewItem | null>(null);
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
  const pct = t?.target ? Math.min(100, Math.round((t.revenue / t.target) * 1000) / 10) : null;

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
          <Card className="space-y-3" aria-label="الإيراد مقابل المستهدف">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm text-muted">المحقق في {year}</p>
                <p className="text-3xl font-bold tabular-nums">{sar(t.revenue)}</p>
              </div>
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
            <p className="text-xs text-muted">
              شاملة الضريبة: المقبوضات المسجّلة من العملاء ودخل الشركة، بتاريخ وصولها. هو نفس رقم
              مؤشر «الإيرادات المحصّلة» في الخطة.
            </p>
          </Card>
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
                      {p.pendingLines > 0 ? (
                        <Button variant="secondary" onClick={() => setLines(p)}>
                          <Wallet className="size-4" /> استلام دفعة
                        </Button>
                      ) : (
                        p.remaining > 0 && (
                          <Button variant="secondary" onClick={() => setReceipt(p)}>
                            <Wallet className="size-4" /> تسجيل استلام
                          </Button>
                        )
                      )}
                      {(p.status === "active" || p.status === "paused") && (
                        <Button
                          variant={p.flags.includes("paid_not_closed") ? "primary" : "ghost"}
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
        <ReceiptDialog
          projectId={receipt.id}
          receipt={null}
          remaining={receipt.remaining}
          contractDate={receipt.contractDate}
          onClose={() => {
            setReceipt(null);
            refresh();
          }}
        />
      )}
      {lines && (
        <LinesDialog
          project={lines}
          onClose={() => {
            setLines(null);
            refresh();
          }}
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

/** A project's waiting instalments, to mark the one that arrived. */
function LinesDialog({ project, onClose }: { project: ReviewItem; onClose: () => void }) {
  const q = useQuery(scheduleQuery(project.id));
  const [line, setLine] = useState<{
    id: string;
    label: string;
    amount: number;
    dueDate: string;
  } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const pending = (q.data ?? []).filter((i) => i.status === "pending");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`دفعات ${project.name}`}>
      {pending.length === 0 && q.isSuccess && (
        <p className="text-sm text-muted">لا دفعات منتظرة.</p>
      )}
      <ul className="divide-y">
        {pending.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span className="font-medium">{i.label}</span>
              <span
                className={cx(
                  "block text-xs",
                  i.dueDate < today ? "font-semibold text-red-600" : "text-muted",
                )}
              >
                {i.dueDate < today ? "متأخرة · " : "تستحق "}
                {day(i.dueDate)} · {sar(i.amount)}
              </span>
            </span>
            <Button variant="secondary" onClick={() => setLine(i)}>
              تم الاستلام
            </Button>
          </li>
        ))}
      </ul>
      {line && (
        <ReceiveDialog
          line={line}
          contractDate={project.contractDate}
          onClose={() => setLine(null)}
        />
      )}
    </Dialog>
  );
}
