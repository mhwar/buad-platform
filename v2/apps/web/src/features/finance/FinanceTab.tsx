import { ENTRY_STATUS_LABELS } from "@buad/schema/finance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Pills, SearchBox } from "../../components/ui";
import { day, pct, sar } from "../../lib/format";
import { type Entry, type Finance, financeApi, financeKey, financeQuery } from "./api";
import { ControlCentre } from "./ControlCentre";
import { EntryDialog } from "./EntryDialog";
import { catLabel } from "./labels";

/** Hero numbers shown on top of the project page (v1 render_fin hero, L5765). */
export function FinanceHero({ projectId }: { projectId: string }) {
  const q = useQuery(financeQuery(projectId));
  if (!q.data) return null;
  const s = q.data.summary;
  const margin = s.grossTotal ? (s.profit / s.grossTotal) * 100 : 0;
  const spent = s.grossTotal ? Math.min(100, (s.totalDeductions / s.grossTotal) * 100) : 0;
  return (
    <Card className="mb-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="قيمة العقد الإجمالية" value={sar(s.grossTotal)} />
        <Stat label="صافي الربح" value={sar(s.profit)} tone="good" />
        <Stat
          label="المتبقي من العقد"
          value={sar(s.remaining)}
          tone={s.remaining < 0 ? "bad" : undefined}
          note={s.remaining < 0 ? "▲ تجاوز" : undefined}
        />
        <Stat
          label="هامش الربح"
          value={pct(margin)}
          tone={margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad"}
        />
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>إجمالي المصروف: {sar(s.totalDeductions)}</span>
          <span>{pct(spent)} من قيمة العقد</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={Math.round(spent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="نسبة الصرف"
        >
          <div
            className={`h-full rounded-full ${spent > 90 ? "bg-red-500" : spent > 70 ? "bg-amber-500" : "bg-accent"}`}
            style={{ width: `${spent}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
  note?: string;
}) {
  const color =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`} dir="ltr">
        {value}
      </p>
      {note && <p className="text-xs text-red-600">{note}</p>}
    </div>
  );
}

export function FinanceTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const q = useQuery(financeQuery(projectId));
  if (q.isPending) return <p className="text-muted">جارٍ تحميل المالية…</p>;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="تعذّر تحميل المالية"
        action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const fin = q.data;
  return (
    <div className="space-y-6">
      <Summary fin={fin} />
      <div className="grid items-start gap-6 xl:grid-cols-[1.2fr_1fr]">
        <ControlCentre projectId={projectId} fin={fin} canEdit={canEdit} />
        <Budget projectId={projectId} fin={fin} canEdit={canEdit} />
      </div>
      <Entries projectId={projectId} fin={fin} canEdit={canEdit} />
    </div>
  );
}

function Summary({ fin }: { fin: Finance }) {
  const s = fin.summary;
  const parts = [
    { label: "أتعاب التنفيذ", v: s.execAmt },
    { label: "التسويق", v: s.mkt },
    { label: "كاش باك", v: s.cb },
    { label: "رسوم إضافية", v: s.cfAmt },
  ].filter((p) => p.v > 0);
  const maxBar = Math.max(s.totalIncome, s.totalExpenses, 1);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold">الملخص المالي</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="قيمة العقد الكاملة" v={s.grossTotal} />
          <Kpi label="إجمالي المصروف" v={s.totalDeductions} />
          <Kpi label="المتبقي من العقد" v={s.remaining} />
          <Kpi
            label="المتاح للتنفيذ"
            v={s.available}
            hint={`بعد الالتزامات ${sar(s.obligations)}`}
          />
          <Kpi
            label="المتبقي للتنفيذ"
            v={s.remainingExec}
            hint={`المصاريف التشغيلية ${sar(s.opExpenses)}`}
          />
          <Kpi label="صافي الربح" v={s.profit} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold">توزيع قيمة العقد</h2>
        <ul className="space-y-1.5 text-sm">
          <li className="flex justify-between font-semibold">
            <span>قيمة العقد</span>
            <span dir="ltr">{sar(s.grossTotal)}</span>
          </li>
          {parts.map((p) => (
            <li key={p.label} className="flex justify-between text-red-600">
              <span>− {p.label}</span>
              <span dir="ltr">{sar(p.v)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1.5 font-semibold">
            <span>= المتاح للتنفيذ</span>
            <span dir="ltr">{sar(s.available)}</span>
          </li>
        </ul>
        <h3 className="mt-5 mb-2 text-sm font-semibold">الدخل مقابل المصاريف</h3>
        {[
          { label: "الدخل المسجّل", v: s.totalIncome, cls: "bg-emerald-500" },
          { label: "إجمالي المصاريف", v: s.totalExpenses, cls: "bg-red-500" },
        ].map((b) => (
          <div key={b.label} className="mb-2 text-xs">
            <div className="mb-1 flex justify-between">
              <span className="text-muted">{b.label}</span>
              <span dir="ltr">{sar(b.v)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full ${b.cls}`}
                style={{ width: `${(b.v / maxBar) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Kpi({ label, v, hint }: { label: string; v: number; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${v < 0 ? "text-red-600" : ""}`} dir="ltr">
        {sar(v)}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Budget({
  projectId,
  fin,
  canEdit,
}: {
  projectId: string;
  fin: Finance;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const api = financeApi(projectId);
  const apply = (res: Finance) => qc.setQueryData(financeKey(projectId), res);
  const total = fin.budget.reduce((a, b) => a + b.amount, 0) / 100;
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">الميزانية المخططة</h2>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={async () => apply(await api.addBudget({ name: "", amount: 0 }))}
          >
            <Plus className="size-4" /> بند
          </Button>
        )}
      </div>
      {fin.budget.length === 0 ? (
        <p className="text-sm text-muted">
          لا توجد بنود. البنود المخططة يمكن تسجيلها لاحقاً كمصروف «من الاتفاقية».
        </p>
      ) : (
        <div className="space-y-2">
          {fin.budget.map((b) => (
            <div key={b.id} className="grid grid-cols-[1.4fr_1fr_auto] items-center gap-2">
              <Input
                aria-label="البند"
                placeholder="البند"
                defaultValue={b.name}
                disabled={!canEdit}
                onBlur={async (e) =>
                  e.target.value !== b.name &&
                  apply(await api.updateBudget(b.id, { name: e.target.value }))
                }
              />
              <Input
                aria-label="المبلغ (ر.س)"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                defaultValue={b.amount / 100}
                disabled={!canEdit}
                onBlur={async (e) =>
                  Number(e.target.value) * 100 !== b.amount &&
                  apply(await api.updateBudget(b.id, { amount: Number(e.target.value) || 0 }))
                }
              />
              {canEdit ? (
                <Button
                  variant="ghost"
                  aria-label={`حذف ${b.name || "البند"}`}
                  onClick={async () => apply(await api.deleteBudget(b.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-between border-t pt-3 text-sm font-semibold">
        <span>الإجمالي المخطط</span>
        <span dir="ltr">{sar(total)}</span>
      </div>
    </Card>
  );
}

function Entries({
  projectId,
  fin,
  canEdit,
}: {
  projectId: string;
  fin: Finance;
  canEdit: boolean;
}) {
  const [filter, setFilter] = useState<"" | "income" | "expense">("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<"new" | "agreement" | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const label = (cat: string) => catLabel(cat, fin.categories, fin.budget);
  const rows = useMemo(
    () =>
      fin.entries
        .filter((e) => !filter || e.type === filter)
        .filter((e) => !q || `${e.description} ${label(e.cat)} ${e.note}`.includes(q))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [fin, filter, q],
  );
  const inc = rows.filter((e) => e.type === "income").reduce((a, e) => a + e.amount, 0) / 100;
  const exp = rows.filter((e) => e.type === "expense").reduce((a, e) => a + e.amount, 0) / 100;
  const counts = {
    all: fin.entries.length,
    income: fin.entries.filter((e) => e.type === "income").length,
    expense: fin.entries.filter((e) => e.type === "expense").length,
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">سجل المعاملات</h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => exportCsv(fin, label)}
            disabled={!fin.entries.length}
          >
            <Download className="size-4" /> Excel
          </Button>
          {canEdit && (
            <Button onClick={() => setAdding("new")}>
              <Plus className="size-4" /> قيد جديد
            </Button>
          )}
        </div>
      </div>
      {fin.summary.missingItems.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          <AlertTriangle className="size-4" />
          لم تُسجَّل بعد: {fin.summary.missingItems.join("، ")}
          {canEdit && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setAdding("agreement")}
            >
              تسجيل الآن
            </button>
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pills<"income" | "expense">
          value={filter}
          onChange={setFilter}
          items={[
            { value: "", label: "الكل", count: counts.all },
            { value: "income", label: "دخل", count: counts.income },
            { value: "expense", label: "مصروف", count: counts.expense },
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="بحث في البيان أو التصنيف أو الملاحظة" />
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {fin.entries.length ? "لا نتائج" : "لا توجد قيود بعد"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-right text-xs text-muted">
              <tr>
                <th className="p-2 font-medium">التاريخ</th>
                <th className="p-2 font-medium">البيان</th>
                <th className="p-2 font-medium">التصنيف</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 text-left font-medium">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b last:border-0 ${canEdit ? "cursor-pointer hover:bg-brand-soft/50" : ""}`}
                  onClick={() => canEdit && setEditing(e)}
                  onKeyDown={(k) => canEdit && k.key === "Enter" && setEditing(e)}
                  tabIndex={canEdit ? 0 : undefined}
                >
                  <td className="whitespace-nowrap p-2 text-muted">{day(e.date)}</td>
                  <td className="p-2">
                    {e.description} {e.source === "agreement" && <Badge tone="blue">اتفاقية</Badge>}
                    {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                  </td>
                  <td className="p-2">{label(e.cat)}</td>
                  <td className="p-2 text-xs">{ENTRY_STATUS_LABELS[e.status]}</td>
                  <td
                    className={`whitespace-nowrap p-2 text-left font-medium ${e.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
                    dir="ltr"
                  >
                    {e.type === "income" ? "+" : "−"}
                    {sar(e.amount / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted">{rows.length} عملية</span>
        <span>
          دخل <b dir="ltr">{sar(inc)}</b> · مصروف <b dir="ltr">{sar(exp)}</b> · إجمالي المصروف من
          العقد <b dir="ltr">{sar(inc + exp)}</b>
        </span>
      </div>
      {adding && (
        <EntryDialog
          open
          onOpenChange={(v) => !v && setAdding(null)}
          projectId={projectId}
          fin={fin}
          startTab={adding}
        />
      )}
      {editing && (
        <EntryDialog
          open
          onOpenChange={(v) => !v && setEditing(null)}
          projectId={projectId}
          fin={fin}
          existing={editing}
        />
      )}
    </Card>
  );
}

/** CSV with a UTF-8 BOM so Excel opens Arabic correctly (v1 wrote HTML disguised as .xls). */
export function toCsv(fin: Finance, label: (cat: string) => string): string {
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const head = [
    "التاريخ",
    "البيان",
    "التصنيف",
    "النوع",
    "المبلغ",
    "هامش الربح",
    "الحالة",
    "ملاحظة",
  ];
  const lines = fin.entries.map((e) =>
    [
      e.date,
      e.description,
      label(e.cat),
      e.type === "income" ? "دخل" : "مصروف",
      (e.amount / 100).toFixed(2),
      e.profitMargin ? `${e.profitMargin}${e.profitMarginType === "pct" ? "%" : ""}` : "",
      ENTRY_STATUS_LABELS[e.status] ?? "",
      e.note,
    ]
      .map(esc)
      .join(","),
  );
  return `﻿${[head.map(esc).join(","), ...lines].join("\r\n")}`;
}

function exportCsv(fin: Finance, label: (cat: string) => string) {
  const url = URL.createObjectURL(
    new Blob([toCsv(fin, label)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "سجل-المعاملات.csv";
  a.click();
  URL.revokeObjectURL(url);
}
