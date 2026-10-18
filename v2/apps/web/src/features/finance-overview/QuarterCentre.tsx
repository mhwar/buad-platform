import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, PieChart, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Stamp } from "../../components/ui";
import { sar } from "../../lib/format";
import { type QuarterData, type QuarterFlag, type QuarterRow, quarterQuery } from "./company-api";
import { DistributionWizard } from "./PartnersTab";
import { Tile } from "./Tile";

const FLAG: Record<QuarterFlag, { text: string; tone: "amber" | "red" | "gray" }> = {
  no_receipts: { text: "لا استلامات مسجلة", tone: "gray" },
  over_distributed: { text: "وُزّع أكثر من ربحه الحالي", tone: "red" },
  estimate: { text: "ربح تقديري: بنود اتفاقية غير مسجلة", tone: "amber" },
  pending_expenses: { text: "مصروفات معلّقة", tone: "amber" },
  cancelled: { text: "مشروع ملغى", tone: "amber" },
  inactive: { text: "مسودة/متوقف", tone: "gray" },
};

const now = new Date();
const thisQ = Math.floor(now.getMonth() / 3) + 1;

/**
 * «توزيع الربع»: profit realized in a quarter (by money received), project by project —
 * what was already distributed, what is left, every warning — then «توزيع هذا الربع».
 */
export function QuarterCentre({
  year,
  q,
  onQuarter,
}: {
  year: number;
  /** 0 = the whole year. */
  q: number;
  onQuarter: (q: number) => void;
}) {
  const d = useQuery(quarterQuery(year, q));
  const [selected, setSelected] = useState<string[] | null>(null);
  const [wizard, setWizard] = useState(false);
  // A different period starts from its own default selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on period change
  useEffect(() => setSelected(null), [year, q]);

  if (d.isPending)
    return (
      <div className="space-y-4">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  if (d.isError || !d.data)
    return (
      <EmptyState
        title="تعذّر تحميل الربع"
        action={<Button onClick={() => d.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const v = d.data;
  const chosen = selected ?? v.defaultSelected;
  const positive = v.rows
    .filter((r) => chosen.includes(r.id) && r.available > 0)
    .reduce((s, r) => s + r.available, 0);
  const total = positive + v.totals.carried + v.company.income - v.company.expenses;
  const active = v.rows.filter((r) => r.receivedToDate !== 0 || r.distributed !== 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{v.label}</h2>
          {v.settlement.stamp === "distributed" && <Stamp kind="distributed">موزّع</Stamp>}
          {v.settlement.stamp === "partial" && (
            <Stamp kind="partial">موزّع جزئياً · بقي {sar(v.settlement.leftover)}</Stamp>
          )}
        </span>
        {q > 0 && (
          <Button disabled={total <= 0 || v.partnersPct <= 0} onClick={() => setWizard(true)}>
            <PieChart className="size-4" /> توزيع {v.label}
          </Button>
        )}
      </div>
      {v.partnersPct <= 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          أضيفوا الشركاء وحصصهم أولاً من تبويب «الشركاء والتوزيع».
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title={`المستلم في ${v.label}`} value={sar(v.totals.receivedInPeriod)} />
        <Tile
          title={q ? "الربح المتحقق في الربع" : "الربح المتحقق في السنة"}
          value={sar(v.totals.realizedInPeriod)}
          tone="good"
        />
        <Tile
          title={q ? "صافي مالية الشركة في الربع" : "صافي مالية الشركة في السنة"}
          value={sar(v.company.income - v.company.expenses)}
          sub={`إيرادات ${sar(v.company.income)} · مصروفات ${sar(v.company.expenses)}`}
        />
        <Tile
          title="القابل للتوزيع (المحدد)"
          value={sar(total)}
          tone={total > 0 ? "good" : "bad"}
          sub={v.totals.carried < 0 ? `منه خصم تجاوزات سابقة ${sar(v.totals.carried)}` : undefined}
        />
      </div>

      {v.settlement.stamp === "partial" && (
        <div
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          بعد توزيعات {v.label} بقي <b>{sar(v.settlement.leftover)}</b> غير مصنّف. لا يُرحَّل: إما يُوزَّع
          أرباحاً («توزيع {v.label}»)، أو تُقيَّد له مصروفات في مشاريعه (من صفوف المشاريع أدناه).
        </div>
      )}
      {v.quarters && <YearQuarters quarters={v.quarters} onQuarter={onQuarter} />}

      <Card className="p-0">
        <div className="px-5 pt-5">
          <h2 className="font-semibold">المشاريع وأرباحها المتحققة</h2>
          <p className="text-xs text-muted">
            يتحقق ربح المشروع بقدر ما استُلم من قيمة عقده حتى نهاية الربع. ما وُزّع من مشروع لا يُوزَّع
            مرة أخرى، وما زاد عن ربحه الحالي يُخصم من التوزيع التالي تلقائياً.
          </p>
        </div>
        {active.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            لا استلامات مسجلة حتى نهاية {v.label}. سجّلوا ما استُلم من العملاء ليظهر الربح المتحقق.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted">
                <tr className="border-b">
                  <th className="px-3 py-2" />
                  <th className="px-2 py-2 font-medium">المشروع</th>
                  <th className="px-2 py-2 font-medium">
                    {q ? "المستلم في الربع" : "المستلم في السنة"}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {q ? "متحقق في الربع" : "متحقق في السنة"}
                  </th>
                  <th className="px-2 py-2 font-medium">متحقق حتى نهايته</th>
                  <th className="px-2 py-2 font-medium">وُزّع سابقاً</th>
                  <th className="px-3 py-2 font-medium">المتبقي للتوزيع</th>
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`تضمين ${r.name}`}
                        disabled={r.available <= 0}
                        checked={r.available > 0 && chosen.includes(r.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? [...chosen, r.id] : chosen.filter((x) => x !== r.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <Link
                        to="/projects/$id"
                        params={{ id: r.id }}
                        search={{ view: "finance" }}
                        className="font-medium text-brand hover:underline"
                      >
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {r.clientName} · استُلم {sar(r.receivedToDate)} من {sar(r.gross)}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.fullyDistributed ? (
                          <Stamp kind="distributed">موزّع بالكامل</Stamp>
                        ) : (
                          r.closed && <Stamp kind="closed">مغلق · جاهز للتوزيع</Stamp>
                        )}
                        {(r.unclassified ?? 0) > 0.5 && r.status === "completed" && (
                          <Badge tone="amber">غير مصنّف {sar(r.unclassified ?? 0)}</Badge>
                        )}
                        {r.flags
                          .filter((f) => f !== "no_receipts")
                          .map((f) => (
                            <Badge key={f} tone={FLAG[f].tone}>
                              {f === "over_distributed"
                                ? `${FLAG[f].text} بـ ${sar(-r.available)}`
                                : FLAG[f].text}
                            </Badge>
                          ))}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{sar(r.receivedInPeriod)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{sar(r.realizedInPeriod)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">{sar(r.realizedToDate)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                      {sar(r.distributed)}
                    </td>
                    <td
                      className={`px-3 py-2.5 whitespace-nowrap font-semibold ${r.available < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                    >
                      {sar(r.available)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-amber-700" /> قبل التوزيع
          </h2>
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted">
            <li>الدفعات الجزئية: يُوزَّع من ربح المشروع بقدر المستلم فقط، والباقي في ربعه.</li>
            <li>الاسترجاع للعميل يُسجَّل استلاماً بالسالب فيخفض الربح المتحقق.</li>
            <li>إن نقص ربح مشروع بعد توزيعه يُخصم الفرق من التوزيع التالي تلقائياً.</li>
            <li>المحتجز (تشغيل/تطوير/احتياطي) لا يعود متاحاً للتوزيع.</li>
            <li>المسودة لا تُعتمد إن وُزّعت مشاريعها في توزيع آخر بعد إعدادها.</li>
          </ul>
          <p className="mt-3 text-sm">
            المحتجز حتى الآن: <b>{sar(v.retained.total)}</b>
          </p>
        </Card>
      </div>

      {wizard && (
        <DistributionWizard
          onClose={() => setWizard(false)}
          preset={{ year, q, projectIds: chosen, label: v.label }}
        />
      )}
    </div>
  );
}

const STAMP_TEXT = { distributed: "موزّع", partial: "موزّع جزئياً", open: "لم يُوزَّع" } as const;

/** The year by quarter: what each realized, what is left, and whether it was distributed. */
function YearQuarters({
  quarters,
  onQuarter,
}: {
  quarters: NonNullable<QuarterData["quarters"]>;
  onQuarter: (q: number) => void;
}) {
  return (
    <Card className="p-0" aria-label="أرباع السنة">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">الأرباع</h2>
        <p className="text-xs text-muted">اختاروا ربعاً لترى مشاريعه وتوزّعه.</p>
      </div>
      <ul className="mt-3 divide-y border-t">
        {quarters.map((x) => (
          <li key={x.q}>
            <button
              type="button"
              onClick={() => onQuarter(x.q)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-right hover:bg-brand-soft/50"
            >
              <span className="min-w-0">
                <span className="font-medium">{x.label}</span>
                <span className="block text-xs text-muted">
                  استُلم {sar(x.receivedInPeriod)} · متحقق {sar(x.realizedInPeriod)} · صافي الشركة{" "}
                  {sar(x.companyNet)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {x.stamp === "open" ? (
                  <Badge tone="gray">{STAMP_TEXT.open}</Badge>
                ) : (
                  <Stamp kind={x.stamp}>
                    {STAMP_TEXT[x.stamp]}
                    {x.stamp === "partial" ? ` · بقي ${sar(x.leftover)}` : ""}
                  </Stamp>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
