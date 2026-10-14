import { ENTRY_STATUS_LABELS } from "@buad/schema/finance";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FileUp, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Pills, SearchBox, Sheet } from "../../components/ui";
import { day, pct, sar } from "../../lib/format";
import { type Entry, type Finance, financeApi, financeKey, financeQuery } from "./api";
import { ControlCentre } from "./ControlCentre";
import { EntryDialog } from "./EntryDialog";
import { catLabel } from "./labels";
import { budgetRows } from "./ProjectFinanceReport";

/* ─────────────────────────────────────────────────────────────────────────────
 * Project finance, laid out by how often each part is used:
 *  - FinanceStrip     the four numbers people look at first, plus what still needs registering
 *  - Transactions     the daily work (main column)
 *  - ContractSummary  how the contract value breaks down (side column, always visible)
 *  - FinanceSettings  contract terms, fees and budget: set once, so they live in a side sheet
 * ──────────────────────────────────────────────────────────────────────────── */

export function useFinance(projectId: string) {
  return useQuery(financeQuery(projectId));
}

export function FinanceStrip({
  projectId,
  canEdit,
  onSettings,
  onRegister,
  fromV1 = false,
  isOwner = false,
}: {
  projectId: string;
  canEdit: boolean;
  onSettings: () => void;
  onRegister: () => void;
  /** Project came from the current platform: its real finance may still be waiting to be imported. */
  fromV1?: boolean;
  isOwner?: boolean;
}) {
  const q = useFinance(projectId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (q.isPending) return <Card className="mb-6 h-36 animate-pulse" aria-busy />;
  if (!q.data) return null;
  const { summary: s, ctrl } = q.data;
  const margin = s.grossTotal ? (s.profit / s.grossTotal) * 100 : 0;
  const spent = s.grossTotal ? (s.totalDeductions / s.grossTotal) * 100 : 0;
  const notSetUp = ctrl.version === 0;
  // A v1 project with untouched default finance: its real entries have not been imported yet.
  const awaitingImport = fromV1 && notSetUp && q.data.entries.length === 0;
  const registerAll = async () => {
    setBusy(true);
    try {
      const res = await financeApi(projectId).registerAllAgreement();
      qc.setQueryData(financeKey(projectId), res);
      setDone(
        res.registered.length
          ? `سُجّل ${res.registered.length} بند من الاتفاقية`
          : "لا بنود بقيمة لتسجيلها",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-6 p-0">
      <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x sm:divide-x-reverse">
        <Stat
          label="قيمة العقد الإجمالية"
          value={sar(s.grossTotal)}
          sub={ctrl.vatIncluded ? "شاملة الضريبة" : `+ ضريبة ${ctrl.vatPct}%`}
          onClick={onSettings}
          action="إعدادات العقد"
        />
        <Stat
          label="صافي الربح"
          value={q.data.profitHidden ? "مخفي" : sar(s.profit)}
          tone={q.data.profitHidden ? undefined : "good"}
        />
        <Stat
          label="المتبقي من العقد"
          value={sar(s.remaining)}
          tone={s.remaining < 0 ? "bad" : undefined}
          sub={s.remaining < 0 ? "▲ تجاوز قيمة العقد" : undefined}
        />
        <Stat
          label="هامش الربح"
          value={q.data.profitHidden ? "مخفي" : pct(margin)}
          tone={
            q.data.profitHidden ? undefined : margin >= 20 ? "good" : margin >= 0 ? "warn" : "bad"
          }
        />
      </div>
      <div className="border-t px-5 py-3">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            إجمالي المصروف من العقد: {sar(s.totalDeductions)}
            {s.pendingExpenses > 0 && (
              <span className="text-amber-700 dark:text-amber-300">
                {" "}
                · منها معلّق غير مدفوع: {sar(s.pendingExpenses)}
              </span>
            )}
          </span>
          <span>{pct(spent)}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={Math.round(spent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="نسبة الصرف من قيمة العقد"
        >
          <div
            className={`h-full rounded-full transition-all ${spent > 90 ? "bg-red-500" : spent > 70 ? "bg-amber-500" : "bg-accent"}`}
            style={{ width: `${Math.min(100, spent)}%` }}
          />
        </div>
      </div>
      {awaitingImport ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-t bg-brand-soft/60 px-5 py-3 text-sm"
        >
          <span>
            <b>مالية هذا المشروع لم تُنقل من المنصة الحالية بعد.</b> الأرقام أعلاه افتراضية وليست
            أرقامه الحقيقية.
          </span>
          {isOwner ? (
            <Link
              to="/settings/import"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white dark:text-canvas"
            >
              <FileUp className="size-4" /> استيراد المالية
            </Link>
          ) : (
            <span className="text-muted">يستطيع مالك المنصة نقلها من صفحة الاستيراد.</span>
          )}
        </div>
      ) : notSetUp && canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-brand-soft/60 px-5 py-3 text-sm">
          <span>
            هذه الأرقام من القيم الافتراضية (ضريبة 15٪، أتعاب تنفيذ 10٪). اضبطوا شروط العقد لتكون
            دقيقة.
          </span>
          <Button onClick={onSettings}>
            <Settings2 className="size-4" /> إعداد العقد
          </Button>
        </div>
      ) : s.missingItems.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-t bg-amber-50 px-5 py-2.5 text-sm text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">لم تُسجَّل بعد: {s.missingItems.join("، ")}</span>
          {canEdit && (
            <span className="flex gap-2">
              <Button onClick={registerAll} disabled={busy} className="px-3 py-1.5">
                {busy ? "جارٍ التسجيل…" : "تسجيلها كلها"}
              </Button>
              <Button variant="ghost" onClick={onRegister} className="px-3 py-1.5">
                مراجعة
              </Button>
            </span>
          )}
        </div>
      ) : (
        done && (
          <p
            role="status"
            className="border-t bg-emerald-50 px-5 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            ✓ {done}
          </p>
        )
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
  action,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
  onClick?: () => void;
  action?: string;
}) {
  const color =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "";
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight sm:text-xl ${color}`} dir="ltr">
        {value}
      </p>
      {sub && (
        <p className={`mt-0.5 text-xs ${tone === "bad" ? "text-red-600" : "text-muted"}`}>{sub}</p>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={action}
      className="group px-5 py-4 text-right transition hover:bg-brand-soft/50"
    >
      {body}
    </button>
  ) : (
    <div className="px-4 py-4 sm:px-5">{body}</div>
  );
}

/** The contract value, step by step down to what is left (v1 calc trail + summary in one place). */
export function ContractSummary({
  projectId,
  onSettings,
  canEdit,
}: {
  projectId: string;
  onSettings: () => void;
  canEdit: boolean;
}) {
  const q = useFinance(projectId);
  if (!q.data) return null;
  const { summary: s, ctrl, budget } = q.data;
  const budgetTotal = budget.reduce((a, b) => a + b.amount, 0) / 100;
  const maxBar = Math.max(s.totalIncome, s.totalExpenses, 1);
  const Row = ({
    sign,
    label,
    v,
    strong,
    tone,
  }: {
    sign?: string;
    label: string;
    v: number;
    strong?: boolean;
    tone?: "neg" | "pos";
  }) => (
    <li
      className={`flex items-baseline justify-between gap-3 py-1 ${strong ? "font-semibold" : ""}`}
    >
      <span className="min-w-0">
        <span className="inline-block w-3.5 text-muted">{sign}</span>
        {label}
      </span>
      <span
        dir="ltr"
        className={`shrink-0 ${tone === "neg" ? "text-red-600" : tone === "pos" ? "text-emerald-700 dark:text-emerald-400" : ""} ${v < 0 ? "text-red-600" : ""}`}
      >
        {sar(v)}
      </span>
    </li>
  );
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">ملخص العقد</h2>
        <Button variant="ghost" onClick={onSettings} className="px-2 py-1 text-xs">
          <Settings2 className="size-3.5" /> {canEdit ? "الإعدادات" : "التفاصيل"}
        </Button>
      </div>
      {(ctrl.contractNo || ctrl.contractDate) && (
        <p className="mb-3 text-xs text-muted">
          {ctrl.contractNo && <span dir="ltr">{ctrl.contractNo}</span>}
          {ctrl.contractNo && ctrl.contractDate && " · "}
          {ctrl.contractDate && day(ctrl.contractDate)}
        </p>
      )}
      <ul className="text-sm">
        <Row label="قيمة العقد" v={s.grossTotal} strong />
        {s.execAmt > 0 && <Row sign="−" label="أتعاب التنفيذ" v={s.execAmt} tone="neg" />}
        {s.mkt > 0 && (
          <Row
            sign="−"
            label={ctrl.mktInternal ? "التسويق (داخلي)" : "التسويق"}
            v={s.mkt}
            tone="neg"
          />
        )}
        {s.cb > 0 && <Row sign="−" label="كاش باك" v={s.cb} tone="neg" />}
        {s.cfAmt > 0 && <Row sign="−" label="رسوم إضافية" v={s.cfAmt} tone="neg" />}
        <li className="my-1.5 border-t" />
        <Row sign="=" label="المتاح للتنفيذ" v={s.available} strong />
        <Row sign="−" label="المصاريف التشغيلية" v={s.opExpenses} tone="neg" />
        <li className="my-1.5 border-t" />
        <Row sign="=" label="المتبقي للتنفيذ" v={s.remainingExec} strong tone="pos" />
      </ul>
      <div className="mt-5 space-y-2.5 text-xs">
        {[
          { label: "الدخل المسجّل", v: s.totalIncome, cls: "bg-emerald-500" },
          { label: "المصاريف", v: s.totalExpenses, cls: "bg-red-500" },
        ].map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex justify-between">
              <span className="text-muted">{b.label}</span>
              <span dir="ltr">{sar(b.v)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full ${b.cls}`}
                style={{ width: `${(b.v / maxBar) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {budget.length > 0 && (
          <p className="flex justify-between border-t pt-2.5">
            <span className="text-muted">الميزانية المخططة ({budget.length} بند)</span>
            <span dir="ltr">{sar(budgetTotal)}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

/** Contract terms, fees, categories and budget, in a side sheet: set once, revisited rarely. */
export function FinanceSettings({
  projectId,
  open,
  onOpenChange,
  canEdit,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
}) {
  const q = useFinance(projectId);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="إعدادات العقد والميزانية"
      description={canEdit ? "تُحفظ التعديلات تلقائياً" : "للاطلاع فقط"}
    >
      {q.data && (
        <div className="space-y-8">
          <ControlCentre projectId={projectId} fin={q.data} canEdit={canEdit} />
          <Budget projectId={projectId} fin={q.data} canEdit={canEdit} />
        </div>
      )}
    </Sheet>
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
  const actual = budgetRows(fin);
  return (
    <section aria-label="الميزانية المخططة" className="border-t pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">الميزانية المخططة</h3>
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
          لا توجد بنود. يمكن تسجيل أي بند لاحقاً كمصروف «من الاتفاقية».
        </p>
      ) : (
        <div className="space-y-2">
          {fin.budget.map((b, i) => (
            <div
              key={b.id}
              className="grid grid-cols-[1.4fr_1fr_auto] items-center gap-x-2 gap-y-1"
            >
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
                  Math.round(Number(e.target.value) * 100) !== b.amount &&
                  apply(await api.updateBudget(b.id, { amount: Number(e.target.value) || 0 }))
                }
              />
              {canEdit ? (
                <Button
                  variant="ghost"
                  aria-label={`حذف ${b.name || "البند"}`}
                  onClick={async () => {
                    const used = (actual[i]?.actual ?? 0) > 0;
                    if (
                      used &&
                      !confirm("على هذا البند قيود مسجّلة؛ ستبقى القيود لكن دون ربطها بالبند. حذف؟")
                    )
                      return;
                    apply(await api.deleteBudget(b.id));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <span />
              )}
              {/* Planned vs actual (entries registered on this item). */}
              <p
                className={`col-span-3 text-xs ${(actual[i]?.diff ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-muted"}`}
              >
                صُرف {sar(actual[i]?.actual ?? 0)} من {sar(b.amount / 100)}
                {(actual[i]?.diff ?? 0) < 0 && " · تجاوز المخطط"}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
        <span>الإجمالي المخطط</span>
        <span dir="ltr">{sar(total)}</span>
      </p>
    </section>
  );
}

/** Daily work: the transactions ledger. */
export function Transactions({
  projectId,
  canEdit,
  adding,
  setAdding,
}: {
  projectId: string;
  canEdit: boolean;
  adding: "new" | "agreement" | null;
  setAdding: (v: "new" | "agreement" | null) => void;
}) {
  const q = useFinance(projectId);
  const [filter, setFilter] = useState<"" | "income" | "expense">("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const fin = q.data;
  const label = (cat: string) => (fin ? catLabel(cat, fin.categories, fin.budget) : cat);
  const rows = useMemo(
    () =>
      (fin?.entries ?? [])
        .filter((e) => !filter || e.type === filter)
        .filter((e) => !search || `${e.description} ${label(e.cat)} ${e.note}`.includes(search))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [fin, filter, search],
  );
  if (q.isPending) return <Card className="h-64 animate-pulse" aria-busy />;
  if (!fin) return <Card>تعذّر تحميل المعاملات</Card>;
  // Cancelled entries stay visible but never count.
  const live = rows.filter((e) => e.status !== "cancelled");
  const inc = live.filter((e) => e.type === "income").reduce((a, e) => a + e.amount, 0) / 100;
  const exp = live.filter((e) => e.type === "expense").reduce((a, e) => a + e.amount, 0) / 100;
  const n = {
    all: fin.entries.length,
    income: fin.entries.filter((e) => e.type === "income").length,
    expense: fin.entries.filter((e) => e.type === "expense").length,
  };

  return (
    <Card className="p-0">
      {/* «قيد جديد» and Excel export live in the page header and its menu (one place each). */}
      <h2 className="px-5 pt-5 font-semibold">سجل المعاملات</h2>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <Pills<"income" | "expense">
          value={filter}
          onChange={setFilter}
          items={[
            { value: "", label: "الكل", count: n.all },
            { value: "income", label: "دخل", count: n.income },
            { value: "expense", label: "مصروف", count: n.expense },
          ]}
        />
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="بحث في البيان أو التصنيف أو الملاحظة"
        />
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-10 pt-4 text-center">
          <p className="text-sm text-muted">
            {fin.entries.length ? "لا نتائج مطابقة" : "لا توجد قيود بعد"}
          </p>
          {!fin.entries.length && canEdit && (
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => setAdding("agreement")}>
                تسجيل بنود الاتفاقية
              </Button>
              <Button onClick={() => setAdding("new")}>
                <Plus className="size-4" /> قيد جديد
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Phones: cards. Larger screens: a table. */}
          <ul className="divide-y border-t sm:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(e)}
                  className="flex w-full items-start justify-between gap-3 px-5 py-3 text-right disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span
                      className={`block truncate font-medium ${e.status === "cancelled" ? "text-muted line-through" : ""}`}
                    >
                      {e.description}
                    </span>
                    <span className="text-xs text-muted">
                      {day(e.date)} · {label(e.cat)}
                      {e.source === "agreement" && " · اتفاقية"}
                      {e.taxInvoice && " · فاتورة ضريبية"}
                      {e.status === "cancelled" && " · ملغى، لا يُحتسب"}
                      {e.status === "pending" && " · معلّق"}
                    </span>
                  </span>
                  <Amount e={e} />
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto border-t sm:block">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted">
                <tr className="border-b">
                  <th className="px-5 py-2 font-medium">التاريخ</th>
                  <th className="px-2 py-2 font-medium">البيان</th>
                  <th className="px-2 py-2 font-medium">التصنيف</th>
                  <th className="px-2 py-2 font-medium">الحالة</th>
                  <th className="px-5 py-2 text-left font-medium">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b last:border-0 ${canEdit ? "cursor-pointer hover:bg-brand-soft/50 focus-visible:bg-brand-soft/50" : ""} ${e.status === "cancelled" ? "text-muted" : ""}`}
                    onClick={() => canEdit && setEditing(e)}
                    onKeyDown={(k) => canEdit && k.key === "Enter" && setEditing(e)}
                    tabIndex={canEdit ? 0 : undefined}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 text-muted">{day(e.date)}</td>
                    <td className="px-2 py-2.5">
                      <span className={e.status === "cancelled" ? "line-through" : undefined}>
                        {e.description}
                      </span>{" "}
                      {e.source === "agreement" && <Badge tone="blue">اتفاقية</Badge>}
                      {e.taxInvoice && <Badge tone="green">فاتورة ضريبية</Badge>}
                      {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                    </td>
                    <td className="px-2 py-2.5">{label(e.cat)}</td>
                    <td className="px-2 py-2.5 text-xs">
                      {e.status === "pending" ? (
                        <Badge tone="amber">{ENTRY_STATUS_LABELS.pending}</Badge>
                      ) : e.status === "cancelled" ? (
                        <span title="لا يُحتسب في أرقام المشروع">
                          {ENTRY_STATUS_LABELS.cancelled} · لا يُحتسب
                        </span>
                      ) : (
                        ENTRY_STATUS_LABELS[e.status] || "—"
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-left">
                      <Amount e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3 text-sm">
            <span className="text-muted">{rows.length} عملية</span>
            <span>
              دخل <b dir="ltr">{sar(inc)}</b> · مصروف <b dir="ltr">{sar(exp)}</b>
            </span>
          </div>
        </>
      )}
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

function Amount({ e }: { e: Entry }) {
  return (
    <span
      className={`whitespace-nowrap font-medium ${e.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}
      dir="ltr"
    >
      {e.type === "income" ? "+" : "−"}
      {sar(e.amount / 100)}
    </span>
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

export function exportCsv(
  fin: Finance,
  label: (cat: string) => string = (c) => catLabel(c, fin.categories, fin.budget),
) {
  const url = URL.createObjectURL(
    new Blob([toCsv(fin, label)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "سجل-المعاملات.csv";
  a.click();
  URL.revokeObjectURL(url);
}
