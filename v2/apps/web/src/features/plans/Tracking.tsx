import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, cx, Dialog, Field, Notice, Select } from "../../components/ui";
import { ApiError, sar } from "../../lib/format";
import { useCan } from "../../session";
import { overviewQuery } from "../sales/api";
import { send } from "../team/queries";
import { fmt, ProgressBar, StatusBadge } from "./ObjectiveCard";
import { type CycleData, type Indicator, seriesQuery, templatesQuery } from "./queries";

const MONTH = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];

/** The plan's headline money target (revenue), followed month by month against straight pacing. */
export function TargetPanel({
  indicator,
  quarters,
}: {
  indicator: Indicator;
  /** Quarterly targets and what each has reached (operational plan). */
  quarters?: { quarter: number; target: number; current: number | null }[];
}) {
  const can = useCan();
  const q = useQuery({ ...seriesQuery(indicator.id), enabled: !indicator.hidden });
  const sales = useQuery({ ...overviewQuery, enabled: can("sales.view") });
  if (indicator.hidden)
    return (
      <Card className="flex items-center gap-3">
        <Target className="size-5 text-muted" />
        <p className="text-sm">
          <b>{indicator.name}</b>: تحقق {Math.round(indicator.attainment * 100)}% من المستهدف.
          الأرقام المالية تظهر لمن لديه صلاحية المالية.
        </p>
      </Card>
    );
  const s = q.data;
  const actual = indicator.current ?? 0;
  const max = Math.max(indicator.target, ...(s?.months.map((m) => m.cumulative) ?? [0]), 1);
  const weighted = sales.data?.pipeline.open.weighted ?? null;
  return (
    <Card className="space-y-4" aria-label="لوحة المستهدف">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Target className="size-4" />
            {indicator.name}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {sar(actual)}
            <span className="ms-2 text-base font-normal text-muted">
              من {sar(indicator.target)}
            </span>
          </p>
        </div>
        {s && (
          <Badge tone={s.pace.ahead ? "green" : "amber"}>
            {s.pace.ahead ? (
              <TrendingUp className="me-1 inline size-3.5" />
            ) : (
              <TrendingDown className="me-1 inline size-3.5" />
            )}
            {s.pace.ahead ? "متقدّم على المسار" : "خلف المسار"}
          </Badge>
        )}
      </div>
      <ProgressBar value={indicator.attainment} label="نسبة تحقيق المستهدف" />

      {s && (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="المؤشرات المالية">
            <Fact label="المتوقع حتى اليوم" value={sar(s.pace.expected)} hint="بخط سير متساوٍ" />
            <Fact
              label="المتوقع نهاية الفترة"
              value={sar(s.pace.projected)}
              hint="بمعدل الإنجاز الحالي"
              tone={s.pace.projected >= indicator.target ? "good" : "warn"}
            />
            <Fact label="المتبقي" value={sar(s.pace.gap)} />
            <Fact
              label="المطلوب شهرياً"
              value={sar(s.pace.perMonthNeeded)}
              hint="لبلوغ المستهدف في موعده"
            />
          </ul>
          {/* Month by month: bars for each month's amount, a line for the running total, a dashed line for pacing. */}
          <figure aria-label="التراكم الشهري مقابل المستهدف">
            <div className="flex h-40 items-end gap-1">
              {s.months.map((m, i) => {
                const pace = (indicator.target * (i + 1)) / s.months.length;
                return (
                  <div key={m.month} className="relative flex h-full flex-1 flex-col justify-end">
                    <span
                      className="absolute inset-x-0 border-t border-dashed border-slate-400"
                      style={{ bottom: `${(pace / max) * 100}%` }}
                      aria-hidden="true"
                    />
                    <span
                      title={`${m.month}: ${sar(m.cumulative)}`}
                      className={cx(
                        "w-full rounded-t",
                        m.future ? "bg-slate-100 dark:bg-slate-800" : "bg-brand",
                      )}
                      style={{ height: `${Math.max(2, (m.cumulative / max) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1 text-[10px] text-muted">
              {s.months.map((m) => (
                <span key={m.month} className="flex-1 text-center">
                  {MONTH[Number(m.month.slice(5, 7)) - 1]}
                </span>
              ))}
            </div>
            <figcaption className="mt-1 text-xs text-muted">
              الأعمدة: المحصّل التراكمي · الخط المتقطع: المسار المطلوب
            </figcaption>
          </figure>
        </>
      )}

      {quarters && quarters.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="المستهدف الربعي">
          {quarters.map((x) => (
            <div key={x.quarter} className="rounded-xl border p-3">
              <p className="text-xs text-muted">الربع {x.quarter}</p>
              <p className="font-bold tabular-nums">{x.current === null ? "—" : sar(x.current)}</p>
              <p className="text-[11px] text-muted">من {sar(x.target)}</p>
              <div className="mt-1.5">
                <ProgressBar
                  value={x.current === null ? null : Math.min(1, x.current / Math.max(1, x.target))}
                  label={`الربع ${x.quarter}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {weighted !== null && s && s.pace.gap > 0 && (
        <p className="rounded-xl bg-brand-soft/60 p-3 text-sm">
          الفرص المفتوحة في المبيعات قيمتها المرجّحة <b>{sar(weighted)}</b>
          {weighted >= s.pace.gap
            ? " — تكفي نظرياً لسد الفجوة إن أُغلقت."
            : " — أقل من الفجوة؛ نحتاج فرصاً أكثر."}
        </p>
      )}
    </Card>
  );
}

function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <li className="rounded-xl bg-canvas/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cx(
          "mt-0.5 font-bold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </li>
  );
}

/** «المتابعة»: every indicator with its status, and the initiatives laid out by quarter. */
export function FollowUp({ d }: { d: CycleData }) {
  const rows = d.objectives.flatMap((o) => o.indicators.map((i) => ({ o, i })));
  const inits = d.objectives.flatMap((o) => o.initiatives.map((i) => ({ o, i })));
  const quarterOf = (date: string) => (date ? Math.floor(Number(date.slice(5, 7)) / 3.01) + 1 : 0);
  const STATUS = {
    todo: "لم تبدأ",
    doing: "قيد التنفيذ",
    blocked: "متعثرة",
    done: "منجزة",
  } as const;
  return (
    <div className="space-y-5">
      <Card className="overflow-x-auto p-0" aria-label="جدول المؤشرات">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b bg-canvas/60 text-xs text-muted">
            <tr>
              {["المؤشر", "الهدف", "الحالي", "المستهدف", "التحقق", "حالة الهدف"].map((h) => (
                <th key={h} className="p-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, i }) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="p-3 font-medium">
                  {i.name}
                  {i.source !== "manual" && (
                    <span className="ms-2 text-[11px] text-brand">من المنصة</span>
                  )}
                </td>
                <td className="p-3 text-muted">
                  {o.quarter > 0 ? `الربع ${o.quarter} · ` : ""}
                  {o.title}
                </td>
                <td className="p-3 tabular-nums">
                  {i.current === null ? "مخفي" : `${fmt(i.current)} ${i.unit}`}
                </td>
                <td className="p-3 tabular-nums">
                  {fmt(i.target)} {i.unit}
                </td>
                <td className="w-40 p-3">
                  <ProgressBar value={i.attainment} label={`تحقق ${i.name}`} />
                </td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <section aria-label="المبادرات حسب الربع">
        <h3 className="mb-2 flex items-center gap-2 font-semibold">
          <CalendarRange className="size-4 text-muted" />
          المبادرات على مدار السنة
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((q) => {
            const list = inits.filter(({ i }) => quarterOf(i.dueDate || i.startDate) === q);
            return (
              <Card key={q} className="space-y-2 p-4">
                <p className="text-sm font-semibold">
                  الربع {q}
                  <span className="ms-2 text-xs font-normal text-muted">
                    {list.filter(({ i }) => i.status === "done").length}/{list.length} منجزة
                  </span>
                </p>
                {list.length === 0 && <p className="text-xs text-muted">لا مبادرات.</p>}
                <ul className="space-y-1.5">
                  {list.map(({ i }) => (
                    <li key={i.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className={cx(i.status === "done" && "text-muted line-through")}>
                        {i.title}
                      </span>
                      <Badge
                        tone={
                          i.status === "done"
                            ? "green"
                            : i.status === "blocked"
                              ? "red"
                              : i.status === "doing"
                                ? "blue"
                                : "gray"
                        }
                      >
                        {STATUS[i.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Create a ready-made plan (strategic + operational) for a chosen year. */
export function TemplateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const t = useQuery(templatesQuery);
  const now = new Date().getFullYear();
  const [year, setYear] = useState(now + 1);
  const [error, setError] = useState("");
  const tpl = t.data?.[0];
  const create = useMutation({
    mutationFn: () => send("POST", `/api/plans/from-template/${tpl?.key}`, { year }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-templates"] });
      onCreated();
    },
    onError: (x) =>
      setError(
        x instanceof ApiError && x.body.error === "exists"
          ? "أُنشئت هذه الخطة لهذه السنة من قبل."
          : "تعذّر الإنشاء",
      ),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="خطة جاهزة" wide>
      {!tpl ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="space-y-4">
          {error && <Notice>{error}</Notice>}
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h3 className="font-bold">{tpl.name}</h3>
              <p className="text-sm text-muted">{tpl.description}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <p className="mb-1 text-xs font-semibold text-muted">الأهداف الاستراتيجية</p>
              <ol className="list-inside list-decimal space-y-0.5 text-sm">
                {tpl.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border p-3">
              <p className="mb-1 text-xs font-semibold text-muted">الخطة التشغيلية</p>
              <ul className="space-y-0.5 text-sm">
                {tpl.quarters.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          </div>
          <Field label="سنة الخطة">
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {[now, now + 1, now + 2].map((y) => (
                <option key={y} value={y} disabled={tpl.usedYears.includes(y)}>
                  {y}
                  {tpl.usedYears.includes(y) ? " — أُنشئت" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            تُنشأ الخطتان بأهدافهما ومؤشراتهما ومبادراتهما ويمكنك تعديل كل شيء بعدها. المؤشرات
            المرتبطة بالمنصة (الإيرادات، العقود، الطلبات، العملاء…) تُحسب تلقائياً، والميزانيات تبقى
            فارغة لتعبّئها.
          </p>
          <Button
            className="w-full"
            disabled={create.isPending || tpl.usedYears.includes(year)}
            onClick={() => create.mutate()}
          >
            إنشاء الخطة لسنة {year}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
