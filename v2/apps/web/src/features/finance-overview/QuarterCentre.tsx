import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, PieChart, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Select } from "../../components/ui";
import { sar } from "../../lib/format";
import { type QuarterFlag, type QuarterRow, quarterQuery } from "./company-api";
import { DistributionWizard } from "./PartnersTab";
import { ReceiptProposals } from "./ReceiptProposals";
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
export function QuarterCentre() {
  // The year and quarter live in the address, so the view can be shared and survives a reload.
  const search = useSearch({ strict: false }) as { year?: number; q?: number };
  const go = useNavigate();
  const year = search.year ?? now.getFullYear();
  const q = search.q ?? thisQ;
  const setYear = (y: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, year: y }), replace: true } as never);
  const setQ = (n: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, q: n }), replace: true } as never);
  const d = useQuery(quarterQuery(year, q));
  const [selected, setSelected] = useState<string[] | null>(null);
  const [wizard, setWizard] = useState(false);
  // A different quarter starts from its own default selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on period change
  useEffect(() => setSelected(null), [year, q]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);
  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="السنة"
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="w-auto"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="الربع">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={q === n}
            onClick={() => setQ(n)}
            className={`rounded-md px-3 py-1.5 text-sm ${q === n ? "bg-brand text-white dark:text-canvas" : "text-muted hover:text-ink"}`}
          >
            ر{n}
          </button>
        ))}
      </div>
    </div>
  );

  if (d.isPending)
    return (
      <div className="space-y-4">
        {picker}
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
        {picker}
        <Button disabled={total <= 0 || v.partnersPct <= 0} onClick={() => setWizard(true)}>
          <PieChart className="size-4" /> توزيع {v.label}
        </Button>
      </div>
      {v.partnersPct <= 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          أضيفوا الشركاء وحصصهم أولاً من تبويب «الشركاء والتوزيع».
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title={`المستلم في ${v.label}`} value={sar(v.totals.receivedInPeriod)} />
        <Tile title="الربح المتحقق في الربع" value={sar(v.totals.realizedInPeriod)} tone="good" />
        <Tile
          title="صافي مالية الشركة في الربع"
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
                  <th className="px-2 py-2 font-medium">المستلم في الربع</th>
                  <th className="px-2 py-2 font-medium">متحقق في الربع</th>
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
        <ReceiptProposals />
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
