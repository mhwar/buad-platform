import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, FileText, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  confirmAction,
  Dialog,
  DialogActions,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { day, sar } from "../../lib/format";
import { financeQuery } from "../finance/api";
import { EntryDialog } from "../finance/EntryDialog";
import { Tile } from "./Tile";
import {
  GAP_TEXT,
  type VatFiling,
  type VatPurchase,
  type VatQuarter,
  type VatReport,
  type VatUnidentified,
  type VatWarningCode,
  type VatYear,
  vatApi,
  vatKeys,
  vatReportQuery,
  vatYearQuery,
} from "./vat-api";

const now = new Date();
const WARNING: Record<VatWarningCode, (n?: number) => string> = {
  no_vat_number: () => "الرقم الضريبي للجهة غير مسجّل في «الإعدادات ← بيانات الجهة».",
  projects_without_receipts: (n) =>
    `${n} مشروع له قيمة عقد ولا استلام معتمداً ولا فاتورة: ضريبة مبيعاته لا تظهر بعد.`,
  invoice_incomplete: (n) =>
    `${n} فاتورة مشتريات ناقصة البيانات (المورد/رقمه الضريبي/رقم الفاتورة/تاريخها).`,
  unidentified_purchases: (n) =>
    `${n} مصروف بلا فاتورة ضريبية: إن كان له فاتورة سجّلوها لتُخصم ضريبتها.`,
  sales_without_invoice: (n) =>
    `${n} مقبوض في مشاريع لم تُسجَّل لها فواتير ضريبية بعد: احتُسبت بتاريخ الاستلام مؤقتاً. سجّلوا الفاتورة المرسلة للعميل من صفحة المشروع لتُحتسب بتاريخها.`,
  invoices_below_receipts: (n) => `${n} مشروع فواتيره المسجّلة أقل مما استُلم منه: قد تنقصه فاتورة.`,
  cf_undecided: (n) =>
    `${n} بند «رسوم إضافية» لم يُحدَّد: هل هو ضريبة العقد المحجوزة للهيئة أم رسوم فعلية؟`,
  vat_as_expense: (n) =>
    `${n} قيد سداد ضريبة مسجّل كمصروف مشروع: انقلوه إلى سداد الربع (القائمة أدناه).`,
};
const STATUS: Record<VatFiling["status"], { label: string; tone: "gray" | "amber" | "green" }> = {
  open: { label: "مفتوح", tone: "gray" },
  filed: { label: "قُدِّم", tone: "amber" },
  paid: { label: "سُدِّد", tone: "green" },
};

/**
 * «الضريبة»: the whole year at a glance (each quarter's return, its due date and whether it
 * was filed and paid), then the detail of the year or of one quarter: sales by the tax invoices
 * issued (else by receipt), purchases by their invoices (projects and the company), and what is
 * still to identify. Paying ZATCA is a settlement, never an expense.
 */
export function VatTab() {
  // The year and the scope (0 = the year) live in the address: shareable, survive a reload.
  const search = useSearch({ strict: false }) as { year?: number; q?: number };
  const go = useNavigate();
  const year = search.year ?? now.getFullYear();
  const q = search.q ?? 0;
  const setYear = (y: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, year: y }), replace: true } as never);
  const setQ = (n: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, q: n || undefined }), replace: true } as never);
  const r = useQuery(vatReportQuery(year, q));
  const y = useQuery(vatYearQuery(year));
  const [buying, setBuying] = useState(false);
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const bar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="الفترة">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={q === n}
              onClick={() => setQ(n)}
              className={`min-h-10 min-w-11 rounded-md px-3 py-1.5 text-sm sm:min-h-0 sm:min-w-0 ${q === n ? "bg-brand text-white dark:text-canvas" : "text-muted hover:text-ink"}`}
            >
              {n ? `ر${n}` : "السنة"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setBuying(true)}>
          <Plus className="size-4" /> مشترى للشركة
        </Button>
        <Link
          to="/settings/finance"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-brand-soft"
        >
          <Settings2 className="size-4" /> إعدادات الضريبة
        </Link>
        {q > 0 && (
          <Link
            to="/finance/vat/report"
            search={{ year, q }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong dark:text-canvas"
          >
            <FileText className="size-4" /> تقرير الربع
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {bar}
      {y.data && <YearTable y={y.data} active={q} onPick={setQ} />}
      {r.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ) : r.isError || !r.data ? (
        <EmptyState
          title="تعذّر تحميل الضريبة"
          action={<Button onClick={() => r.refetch()}>إعادة المحاولة</Button>}
        />
      ) : (
        <Detail v={r.data} />
      )}
      {buying && <CompanyPurchaseDialog onClose={() => setBuying(false)} />}
    </div>
  );
}

function Detail({ v }: { v: VatReport }) {
  return (
    <>
      <p className="text-sm text-muted">
        {v.period.label} · المبيعات بتاريخ الفاتورة الضريبية المرسلة للعميل (أو تاريخ الاستلام إن لم
        تُسجَّل فاتورة)، والمشتريات بتاريخ فاتورتها · النسبة الحالية {v.rate}%
      </p>
      {v.warnings.length > 0 && (
        <div
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ul className="space-y-1">
            {v.warnings.map((w) => (
              <li key={w.code} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {WARNING[w.code]?.(w.count) ?? w.code}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title="ضريبة المبيعات (المخرجات)"
          value={sar(v.outputVat)}
          sub={`على مبيعات ${sar(v.sales.base)} قبل الضريبة`}
        />
        <Tile
          title="ضريبة المشتريات القابلة للخصم"
          value={sar(v.inputVat)}
          sub={`على مشتريات ${sar(v.purchases.base)} قبل الضريبة`}
        />
        <Tile
          title={v.netPayable >= 0 ? "صافي المستحق للهيئة" : "صافي المسترد من الهيئة"}
          value={sar(Math.abs(v.netPayable))}
          tone={v.netPayable > 0 ? "warn" : "good"}
          sub={v.reserved ? `محجوز في المشاريع لها: ${sar(v.reserved)}` : undefined}
        />
      </div>
      <VatExpenses v={v} />
      <Sales v={v} />
      <Purchases v={v} />
      <Unidentified v={v} />
    </>
  );
}

/** The year by quarter: what each return comes to, when it is due, and where it stands. */
function YearTable({
  y,
  active,
  onPick,
}: {
  y: VatYear;
  active: number;
  onPick: (q: number) => void;
}) {
  const [editing, setEditing] = useState<VatQuarter | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-5">
        <div>
          <h2 className="font-semibold">إقرارات سنة {y.year}</h2>
          <p className="text-xs text-muted">
            يُقدَّم كل إقرار ويُسدَّد قبل نهاية الشهر التالي للربع. السداد للهيئة تسوية لا مصروف.
          </p>
        </div>
        <p className="text-sm">
          صافي السنة <b>{sar(y.totals.netPayable)}</b> · سُدِّد <b>{sar(y.totals.paid)}</b> ·{" "}
          {y.totals.balance >= 0 ? "المتبقي" : "رصيد دائن"}{" "}
          <b className={y.totals.balance > 0 ? "text-amber-700 dark:text-amber-300" : ""}>
            {sar(Math.abs(y.totals.balance))}
          </b>
        </p>
      </div>
      <div className="mt-3 overflow-x-auto border-t">
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-muted">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">الربع</th>
              <th className="px-2 py-2 font-medium">المخرجات</th>
              <th className="px-2 py-2 font-medium">المدخلات</th>
              <th className="px-2 py-2 font-medium">الصافي</th>
              <th className="px-2 py-2 font-medium">الموعد</th>
              <th className="px-2 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium" aria-label="إجراء" />
            </tr>
          </thead>
          <tbody>
            {y.quarters.map((x) => {
              const st = STATUS[x.filing?.status ?? "open"];
              const late = !x.filing?.paidOn && x.dueDate < today && x.netPayable > 0;
              return (
                <tr
                  key={x.key}
                  className={`border-b last:border-0 ${active === x.q ? "bg-brand-soft/60" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="font-medium text-brand hover:underline"
                      onClick={() => onPick(x.q)}
                    >
                      ر{x.q}
                    </button>
                    {x.warnings > 0 && (
                      <AlertTriangle
                        className="ms-1 inline size-3.5 text-amber-600"
                        aria-label="فيه تنبيهات"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">{sar(x.outputVat)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{sar(x.inputVat)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 font-semibold">
                    {sar(x.netPayable)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-2.5 ${late ? "text-red-600 dark:text-red-400" : ""}`}
                  >
                    {day(x.dueDate)}
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {x.filing?.paidAmount ? (
                      <span className="block text-xs text-muted">{sar(x.filing.paidAmount)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    <Button variant="ghost" onClick={() => setEditing(x)}>
                      {x.filing?.status === "paid" ? "تعديل" : "تسجيل"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <FilingDialog quarter={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function FilingDialog({ quarter, onClose }: { quarter: VatQuarter; onClose: () => void }) {
  const qc = useQueryClient();
  const f = quarter.filing;
  const [status, setStatus] = useState<VatFiling["status"]>(f?.status ?? "filed");
  const [filedOn, setFiledOn] = useState(f?.filedOn ?? "");
  const [paidOn, setPaidOn] = useState(f?.paidOn ?? "");
  const [paidAmount, setPaidAmount] = useState(
    String(f?.paidAmount || Math.max(0, quarter.netPayable)),
  );
  const [reference, setReference] = useState(f?.reference ?? "");
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      await vatApi.saveFiling(quarter.key, {
        status,
        filedOn,
        paidOn: status === "paid" ? paidOn : "",
        paidAmount: status === "paid" ? Number(paidAmount) || 0 : 0,
        reference,
        note: f?.note ?? "",
      });
      await qc.invalidateQueries({ queryKey: vatKeys.all });
      toast("حُفظ الإقرار");
      onClose();
    } catch {
      setErr("تعذّر الحفظ");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`إقرار ${quarter.label}`}
      footer={
        <DialogActions onCancel={onClose}>
          <Button onClick={save}>حفظ</Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <p className="mb-4 text-sm">
        الصافي حسب المنصة الآن: <b>{sar(quarter.netPayable)}</b> · موعد التقديم{" "}
        {day(quarter.dueDate)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الحالة">
          <Select value={status} onChange={(e) => setStatus(e.target.value as "filed")}>
            <option value="open">مفتوح</option>
            <option value="filed">قُدِّم ولم يُسدَّد</option>
            <option value="paid">سُدِّد</option>
          </Select>
        </Field>
        <Field label="تاريخ التقديم">
          <Input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} />
        </Field>
        {status === "paid" && (
          <>
            <Field label="تاريخ السداد">
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="المبلغ المسدَّد (ر.س)">
              <Input
                type="number"
                inputMode="decimal"
                dir="ltr"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="رقم المرجع (سداد)" className="sm:col-span-2">
          <Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Tax paid to ZATCA booked as a project expense: moved, with one click each, to its return. */
function VatExpenses({ v }: { v: VatReport }) {
  const qc = useQueryClient();
  const [periodOf, setPeriodOf] = useState<Record<string, string>>({});
  if (!v.vatExpenses.length) return null;
  const keyOf = (date: string) => {
    // A payment usually settles the previous quarter's return.
    const [yy, mm] = date.split("-").map(Number) as [number, number];
    const q = Math.floor((mm - 1) / 3) + 1;
    return q === 1 ? `${yy - 1}-Q4` : `${yy}-Q${q - 1}`;
  };
  return (
    <Card className="space-y-3 border-amber-300 dark:border-amber-800">
      <div>
        <h2 className="font-semibold">سداد ضريبة مسجّل كمصروف مشروع ({v.vatExpenses.length})</h2>
        <p className="text-xs text-muted">
          ما يُدفع للهيئة ليس تكلفة مشروع. اختاروا الإقرار الذي سدّده هذا المبلغ ثم «نقل»: يُلغى القيد
          من مصروفات المشروع ويُسجَّل سداداً لذلك الإقرار.
        </p>
      </div>
      <ul className="divide-y text-sm">
        {v.vatExpenses.map((e) => {
          const key = periodOf[e.entryId] ?? keyOf(e.date);
          return (
            <li
              key={e.entryId}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span>
                {e.description}
                <span className="block text-xs text-muted">
                  {day(e.date)} · {e.projectName} · {sar(e.amount)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Input
                  aria-label="الإقرار"
                  dir="ltr"
                  className="w-28"
                  value={key}
                  onChange={(x) => setPeriodOf((p) => ({ ...p, [e.entryId]: x.target.value }))}
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!/^\d{4}-Q[1-4]$/.test(key))
                      return toast("اكتبوا الإقرار مثل 2026-Q2", "error");
                    if (
                      !(await confirmAction({
                        title: `نقل ${sar(e.amount)} إلى سداد إقرار ${key}؟`,
                        text: "يُلغى القيد من مصروفات المشروع (يبقى ظاهراً ملغى) ويُضاف إلى ما سُدّد للهيئة.",
                        action: "نقل",
                      }))
                    )
                      return;
                    try {
                      await vatApi.convertEntry({
                        projectId: e.projectId,
                        entryId: e.entryId,
                        periodKey: key,
                      });
                      await qc.invalidateQueries({ queryKey: vatKeys.all });
                      qc.invalidateQueries({ queryKey: ["finance-overview"] });
                      toast("نُقل إلى سداد الإقرار");
                    } catch {
                      toast("تعذّر النقل", "error");
                    }
                  }}
                >
                  نقل
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const PURCHASE_CATS = [
  ["asset", "أصل رأسمالي (أجهزة، أثاث…)"],
  ["purchase", "مشتريات عامة"],
  ["tools", "خدمات وأدوات"],
  ["hosting", "استضافة وبنية تحتية"],
  ["marketing", "تسويق وإعلان"],
  ["other", "أخرى"],
] as const;

/**
 * A purchase by the company itself (outside any project), with its tax invoice: its VAT is
 * claimed in the return of the invoice's quarter. Also opens an existing company expense.
 */
export function CompanyPurchaseDialog({
  existing,
  onClose,
}: {
  existing?: { id: string; description: string; amount: number; date: string; cat: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.cat ?? "asset");
  const [date, setDate] = useState(existing?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [supplierName, setSupplierName] = useState("");
  const [supplierVatNo, setSupplierVatNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [vat, setVat] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    const n = Number(amount);
    if (!description.trim() || !(n > 0)) return setErr("أدخلوا البيان والمبلغ");
    const body = {
      type: "expense",
      category,
      date,
      description: description.trim(),
      amount: n,
      taxInvoice: {
        supplierName,
        supplierVatNo,
        invoiceNo,
        invoiceDate: date,
        ...(vat ? { vatAmount: Number(vat) } : {}),
      },
    };
    try {
      const res = await fetch(
        existing ? `/api/finance/company/entries/${existing.id}` : "/api/finance/company/entries",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: vatKeys.all });
      qc.invalidateQueries({ queryKey: ["company-finance"] });
      toast("سُجّل المشترى بفاتورته");
      onClose();
    } catch {
      setErr("تعذّر الحفظ");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "فاتورة ضريبية لمصروف الشركة" : "مشترى للشركة بفاتورة ضريبية"}
      footer={
        <DialogActions onCancel={onClose}>
          <Button onClick={save}>حفظ</Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <p className="mb-4 text-sm text-muted">
        مشتريات الشركة خارج المشاريع: أجهزة، أثاث، اشتراكات… تُخصم ضريبتها في إقرار ربع الفاتورة،
        وتظهر في «إيرادات الشركة ومصروفاتها».
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="البيان" className="sm:col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="النوع">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {PURCHASE_CATS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="تاريخ الفاتورة">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="المبلغ شامل الضريبة (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="الضريبة (ر.س)" hint="فارغ = تُحسب بالنسبة الحالية">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
        </Field>
        <Field label="المورد">
          <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </Field>
        <Field label="الرقم الضريبي للمورد">
          <Input
            dir="ltr"
            value={supplierVatNo}
            onChange={(e) => setSupplierVatNo(e.target.value)}
          />
        </Field>
        <Field label="رقم الفاتورة" className="sm:col-span-2">
          <Input dir="ltr" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Sales({ v }: { v: VatReport }) {
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">المبيعات</h2>
        <p className="text-xs text-muted">
          الفواتير الضريبية المرسلة للعملاء بتاريخها. المشروع الذي لم تُسجَّل له فاتورة تُحتسب استلاماته
          المعتمدة بتاريخ وصولها، مؤقتاً.
        </p>
      </div>
      {v.sales.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">لا مبيعات في هذه الفترة.</p>
      ) : (
        <div className="mt-3 overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">التاريخ</th>
                <th className="px-2 py-2 font-medium">المشروع</th>
                <th className="px-2 py-2 font-medium">المستلم</th>
                <th className="px-2 py-2 font-medium">قبل الضريبة</th>
                <th className="px-4 py-2 font-medium">الضريبة</th>
              </tr>
            </thead>
            <tbody>
              {v.sales.rows.map((s) => (
                <tr key={s.invoiceId || s.receiptId} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5">{day(s.date)}</td>
                  <td className="px-2 py-2.5">
                    <Link
                      to="/projects/$id"
                      params={{ id: s.projectId }}
                      search={{ view: "finance" }}
                      className="text-brand hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {s.clientName} ·{" "}
                      {s.source === "invoice" ? (
                        <>
                          فاتورة <span dir="ltr">{s.invoiceNo || "بلا رقم"}</span>
                        </>
                      ) : (
                        <Badge tone="amber">استلام بلا فاتورة</Badge>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">{sar(s.amount)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{sar(s.base)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{sar(s.vat)}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-semibold">
                <td className="px-4 py-2.5" colSpan={2}>
                  الإجمالي
                </td>
                <td className="px-2 py-2.5">{sar(v.sales.total)}</td>
                <td className="px-2 py-2.5">{sar(v.sales.base)}</td>
                <td className="px-4 py-2.5">{sar(v.sales.vat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Opens the entry's own dialog (any project): loads that project's finance first. */
function EditPurchase({
  projectId,
  entryId,
  onClose,
}: {
  projectId: string;
  entryId: string;
  onClose: () => void;
}) {
  const fin = useQuery(financeQuery(projectId));
  const qc = useQueryClient();
  const entry = fin.data?.entries.find((e) => e.id === entryId);
  if (!fin.data || !entry) return null;
  return (
    <EntryDialog
      open
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          qc.invalidateQueries({ queryKey: vatKeys.all });
        }
      }}
      projectId={projectId}
      fin={fin.data}
      existing={entry}
    />
  );
}

function Purchases({ v }: { v: VatReport }) {
  const [edit, setEdit] = useState<VatPurchase | null>(null);
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">المشتريات بفواتير ضريبية</h2>
        <p className="text-xs text-muted">
          تدخل تلقائياً: كل مصروف في أي مشروع سُجّلت له فاتورة ضريبية، وكل مشترى للشركة بفاتورة.
        </p>
      </div>
      {v.purchases.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          لا مشتريات بفواتير ضريبية في هذه الفترة.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">تاريخ الفاتورة</th>
                <th className="px-2 py-2 font-medium">البيان / المورد</th>
                <th className="px-2 py-2 font-medium">المشروع</th>
                <th className="px-2 py-2 font-medium">قبل الضريبة</th>
                <th className="px-4 py-2 font-medium">الضريبة</th>
              </tr>
            </thead>
            <tbody>
              {v.purchases.rows.map((p) => (
                <tr
                  key={p.entryId}
                  className="cursor-pointer border-b hover:bg-brand-soft/50"
                  onClick={() => p.owner === "project" && setEdit(p)}
                  onKeyDown={(k) => k.key === "Enter" && p.owner === "project" && setEdit(p)}
                  tabIndex={p.owner === "project" ? 0 : -1}
                >
                  <td className="whitespace-nowrap px-4 py-2.5">{day(p.date)}</td>
                  <td className="px-2 py-2.5">
                    {p.description}
                    <span className="block text-xs text-muted">
                      {p.supplierName || "—"} · <span dir="ltr">{p.invoiceNo || "بلا رقم"}</span>
                    </span>
                    {p.gaps.length > 0 && (
                      <Badge tone="amber">ناقص: {p.gaps.map((g) => GAP_TEXT[g]).join("، ")}</Badge>
                    )}
                  </td>
                  <td className="px-2 py-2.5">{p.projectName}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{sar(p.base)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{sar(p.vat)}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-semibold">
                <td className="px-4 py-2.5" colSpan={3}>
                  الإجمالي
                </td>
                <td className="px-2 py-2.5">{sar(v.purchases.base)}</td>
                <td className="px-4 py-2.5">{sar(v.purchases.vat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <EditPurchase
          projectId={edit.projectId}
          entryId={edit.entryId}
          onClose={() => setEdit(null)}
        />
      )}
    </Card>
  );
}

function Unidentified({ v }: { v: VatReport }) {
  const [edit, setEdit] = useState<VatUnidentified | null>(null);
  const [companyEdit, setCompanyEdit] = useState<VatUnidentified | null>(null);
  if (v.unidentified.rows.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">مصروفات لم تُحدَّد بعد ({v.unidentified.rows.length})</h2>
        <p className="text-xs text-muted">
          مصروفات الفترة بلا فاتورة ضريبية (دون الرواتب وبنود الاتفاقية والزكاة والرسوم الحكومية).
          إن كان لأحدها فاتورة، سجّلوها لتُخصم ضريبتها.
        </p>
      </div>
      <ul className="mt-3 divide-y border-t text-sm">
        {v.unidentified.rows.map((u) => (
          <li
            key={u.entryId}
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"
          >
            <span>
              {u.description}
              <span className="block text-xs text-muted">
                {day(u.date)} · {u.projectName} · {u.category}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <b>{sar(u.amount)}</b>
              <Button
                variant="secondary"
                onClick={() => (u.owner === "company" ? setCompanyEdit(u) : setEdit(u))}
              >
                له فاتورة ضريبية
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {companyEdit && (
        <CompanyPurchaseDialog
          existing={{
            id: companyEdit.entryId,
            description: companyEdit.description,
            amount: companyEdit.amount,
            date: companyEdit.date,
            cat: companyEdit.cat,
          }}
          onClose={() => setCompanyEdit(null)}
        />
      )}
      {edit && (
        <EditPurchase
          projectId={edit.projectId}
          entryId={edit.entryId}
          onClose={() => setEdit(null)}
        />
      )}
    </Card>
  );
}
