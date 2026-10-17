import type { ProjectDefaults } from "@buad/schema/org";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Button, Card, Field, Input, Notice, PageHeader, Select, toast } from "../../components/ui";
import { day, sar, today } from "../../lib/format";
import { useCan } from "../../session";
import { FEE_ROWS } from "../finance/labels";
import { saveVatSettings, vatKeys, vatSettingsQuery } from "../finance-overview/vat-api";
import { yearReviewQuery } from "../year-review/api";
import { orgSettingsQuery, saveOrgSettings } from "./api";

/**
 * «الإعدادات ← المالية»: what is set once for the company's money — the year's target, the cash
 * opening balance, the terms new projects start with, and VAT. Nothing here is filled in for you.
 */
export function FinanceSettingsPage() {
  const can = useCan();
  const edit = can("treasury.edit");
  const q = useQuery(orgSettingsQuery);
  return (
    <div className="space-y-4">
      <PageHeader
        title="المالية"
        subtitle="ما يُضبط مرة واحدة: مستهدف السنة، والرصيد الافتتاحي، وشروط المشاريع الجديدة، والضريبة."
      />
      {q.isError && <Notice>تعذّر تحميل الإعدادات المالية.</Notice>}
      {q.data && (
        <>
          <TargetCard targets={q.data.targets} edit={edit} />
          <CashCard opening={q.data.cashOpening} edit={edit} />
          <DefaultsCard
            defaults={q.data.projectDefaults}
            isSet={q.data.projectDefaultsSet}
            edit={edit}
          />
        </>
      )}
      {can("vat.view") && <VatCard edit={can("vat.edit")} />}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-4" role="region" aria-label={title}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      {children}
    </Card>
  );
}

function useSave() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const save = async (patch: Parameters<typeof saveOrgSettings>[0], done: string) => {
    setError("");
    try {
      qc.setQueryData(orgSettingsQuery.queryKey, await saveOrgSettings(patch));
      await qc.invalidateQueries({ queryKey: ["year-review"] });
      toast(done);
      return true;
    } catch {
      setError("تعذّر الحفظ، تحققوا من القيم وحاولوا مرة أخرى.");
      return false;
    }
  };
  return { save, error };
}

function TargetCard({ targets, edit }: { targets: Record<string, number>; edit: boolean }) {
  const year = new Date().getFullYear();
  const review = useQuery(yearReviewQuery(year));
  const fromPlan = review.data?.totals.targetSource === "plan" ? review.data.totals.target : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const { save, error } = useSave();
  const years = [year, year + 1];
  return (
    <Section
      title="مستهدف الإيراد"
      hint="شامل الضريبة، ويُقاس به «اليوم» و«مراجعة السنة». إن تُرك فارغاً يُؤخذ من مؤشر الإيراد في خطة السنة."
    >
      {error && <Notice>{error}</Notice>}
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {years.map((y) => {
          const saved = targets[String(y)];
          const v = values[y] ?? (saved === undefined ? "" : String(saved));
          return (
            <div key={y} className="flex items-end gap-2">
              <Field
                label={`مستهدف ${y} (ر.س)`}
                className="flex-1"
                hint={
                  saved === undefined && y === year && fromPlan
                    ? `من الخطة الآن: ${sar(fromPlan)}`
                    : undefined
                }
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  dir="ltr"
                  value={v}
                  disabled={!edit}
                  placeholder="غير محدد"
                  onChange={(e) => setValues((s) => ({ ...s, [y]: e.target.value }))}
                />
              </Field>
              {edit && (
                <Button
                  variant="secondary"
                  aria-label={`حفظ مستهدف ${y}`}
                  className={saved === undefined && y === year && fromPlan ? "mb-5" : ""}
                  disabled={v === (saved === undefined ? "" : String(saved))}
                  onClick={async () => {
                    const n = v.trim() === "" ? null : Number(v);
                    if (n !== null && !(n >= 0)) return;
                    if (await save({ targets: { [String(y)]: n } }, `حُفظ مستهدف ${y}`))
                      setValues(({ [y]: _done, ...rest }) => rest);
                  }}
                >
                  حفظ
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function CashCard({
  opening,
  edit,
}: {
  opening: { amount: number; date: string } | null;
  edit: boolean;
}) {
  const [amount, setAmount] = useState(opening ? String(opening.amount) : "");
  const [date, setDate] = useState(opening?.date ?? today());
  const { save, error } = useSave();
  const changed = amount !== (opening ? String(opening.amount) : "") || date !== opening?.date;
  return (
    <Section
      title="الرصيد الافتتاحي"
      hint={
        <>
          النقد المتاح في تاريخ معيّن، ومنه يبدأ التوقّع النقدي لـ13 أسبوعاً في{" "}
          <Link
            to="/finance"
            search={{ tab: "receivables" }}
            className="font-semibold text-brand underline"
          >
            التحصيل والتدفق
          </Link>
          . يراه كل من يطّلع على المالية.
        </>
      }
    >
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="الرصيد (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            disabled={!edit}
            placeholder="غير محدد"
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="بتاريخ">
          <Input
            type="date"
            value={date}
            disabled={!edit}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        {edit && (
          <Button
            variant="secondary"
            disabled={!changed}
            onClick={() =>
              save(
                {
                  cashOpening:
                    amount.trim() === "" ? null : { amount: Number(amount), date: date || today() },
                },
                "حُفظ الرصيد الافتتاحي",
              )
            }
          >
            حفظ
          </Button>
        )}
      </div>
      {opening && (
        <p className="text-xs text-muted">
          آخر قيمة محفوظة: {sar(opening.amount)} بتاريخ {day(opening.date)}.
        </p>
      )}
    </Section>
  );
}

function DefaultsCard({
  defaults,
  isSet,
  edit,
}: {
  defaults: ProjectDefaults;
  isSet: boolean;
  edit: boolean;
}) {
  const [d, setD] = useState(defaults);
  const { save, error } = useSave();
  const set = <K extends keyof ProjectDefaults>(k: K, v: ProjectDefaults[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const changed = JSON.stringify(d) !== JSON.stringify(defaults) || !isSet;
  return (
    <Section
      title="شروط المشاريع الجديدة"
      hint={
        isSet
          ? "يبدأ بها كل مشروع جديد، ثم تُعدَّل لكل عقد من «إعدادات العقد» في صفحته. لا تتغير المشاريع القائمة."
          : "تعمل المنصة الآن بقيمها الأصلية (ضريبة 15% وأتعاب تنفيذ 10% من الإجمالي). احفظوا قيمكم هنا لتبدأ بها المشاريع الجديدة؛ لا تتغير المشاريع القائمة."
      }
    >
      {error && <Notice>{error}</Notice>}
      <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:max-w-sm">
        <Field label="نسبة الضريبة %">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            dir="ltr"
            value={d.vatPct}
            disabled={!edit}
            onChange={(e) => set("vatPct", num(e.target.value))}
          />
        </Field>
        <label className="mb-2.5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.vatIncluded}
            disabled={!edit}
            onChange={(e) => set("vatIncluded", e.target.checked)}
            className="size-4 accent-[var(--color-brand)]"
          />
          شامل الضريبة
        </label>
      </div>
      <div className="space-y-3">
        {FEE_ROWS.map(({ key, label }) => {
          const v = `${key}V` as const;
          const t = `${key}Type` as const;
          const b = `${key}Base` as const;
          return (
            <div
              key={key}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.3fr_1fr_1fr]"
            >
              <Field label={label} className="col-span-2 sm:col-span-1">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={d[v]}
                  disabled={!edit}
                  onChange={(e) => set(v, num(e.target.value))}
                />
              </Field>
              <Select
                aria-label={`نوع ${label}`}
                value={d[t]}
                disabled={!edit}
                onChange={(e) => set(t, e.target.value as "pct")}
              >
                <option value="pct">%</option>
                <option value="fixed">مبلغ ثابت</option>
              </Select>
              <Select
                aria-label={`أساس ${label}`}
                value={d[b]}
                disabled={!edit || d[t] === "fixed"}
                onChange={(e) => set(b, e.target.value as "net")}
              >
                <option value="net">من الصافي</option>
                <option value="gross">من الإجمالي</option>
              </Select>
            </div>
          );
        })}
      </div>
      {edit && (
        <div>
          <Button
            disabled={!changed}
            onClick={() => save({ projectDefaults: d }, "حُفظت شروط المشاريع الجديدة")}
          >
            حفظ الشروط
          </Button>
        </div>
      )}
    </Section>
  );
}

function VatCard({ edit }: { edit: boolean }) {
  const qc = useQueryClient();
  const s = useQuery(vatSettingsQuery);
  const [rate, setRate] = useState<string | null>(null);
  const [period, setPeriod] = useState<"quarterly" | "monthly" | null>(null);
  const [err, setErr] = useState("");
  if (!s.data) return null;
  const r = rate ?? String(s.data.rate);
  const p = period ?? s.data.period;
  return (
    <Section
      title="الضريبة"
      hint="نسبة ضريبة المشتريات الجديدة ودورة الإقرار. ضريبة كل عقد تُضبط في المشروع، وتبدأ من «شروط المشاريع الجديدة»."
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نسبة الضريبة %" hint="لا تتغير فواتير سُجّلت سابقاً">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            dir="ltr"
            value={r}
            disabled={!edit}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="دورة الإقرار" hint="تقرير الضريبة في المنصة ربع سنوي">
          <Select
            value={p}
            disabled={!edit}
            onChange={(e) => setPeriod(e.target.value as "quarterly")}
          >
            <option value="quarterly">ربع سنوي</option>
            <option value="monthly">شهري</option>
          </Select>
        </Field>
      </div>
      <p className="text-sm">
        الرقم الضريبي للجهة:{" "}
        {s.data.vatNumber ? (
          <b dir="ltr">{s.data.vatNumber}</b>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">غير مسجّل</span>
        )}{" "}
        <Link to="/settings/org" className="text-brand underline">
          تعديله من بيانات الجهة
        </Link>
      </p>
      {edit && (
        <div>
          <Button
            variant="secondary"
            disabled={rate === null && period === null}
            onClick={async () => {
              const n = Number(r);
              if (!(n >= 0 && n <= 100)) return setErr("النسبة بين 0 و100");
              try {
                await saveVatSettings({ rate: n, period: p });
                await qc.invalidateQueries({ queryKey: vatKeys.all });
                setRate(null);
                setPeriod(null);
                setErr("");
                toast("حُفظت إعدادات الضريبة");
              } catch {
                setErr("تعذّر الحفظ");
              }
            }}
          >
            حفظ الضريبة
          </Button>
        </div>
      )}
    </Section>
  );
}
