import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, FileText, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
} from "../../components/ui";
import { day, sar } from "../../lib/format";
import { financeQuery } from "../finance/api";
import { EntryDialog } from "../finance/EntryDialog";
import { Tile } from "./Tile";
import {
  GAP_TEXT,
  saveVatSettings,
  type VatPurchase,
  type VatReport,
  type VatUnidentified,
  type VatWarningCode,
  vatKeys,
  vatReportQuery,
  vatSettingsQuery,
} from "./vat-api";

const now = new Date();
const WARNING: Record<VatWarningCode, (n?: number) => string> = {
  no_vat_number: () => "الرقم الضريبي للجهة غير مسجّل في «الإعدادات ← بيانات الجهة».",
  projects_without_receipts: (n) =>
    `${n} مشروع له قيمة عقد ولا استلام معتمداً: ضريبة مبيعاته لا تظهر في أي ربع حتى تعتمدوا استلاماته.`,
  invoice_incomplete: (n) =>
    `${n} فاتورة مشتريات ناقصة البيانات (المورد/رقمه الضريبي/رقم الفاتورة/تاريخها).`,
  unidentified_purchases: (n) =>
    `${n} مصروف لم يُحدَّد بعد: إن كان له فاتورة ضريبية سجّلوها ليدخل في الضريبة.`,
};

/**
 * «الضريبة»: the quarter's VAT — sales by the day each payment arrived, purchases by their
 * tax invoices, what is still to identify, and the net payable.
 */
export function VatTab() {
  // The year and quarter live in the address, so the view can be shared and survives a reload.
  const search = useSearch({ strict: false }) as { year?: number; q?: number };
  const go = useNavigate();
  const year = search.year ?? now.getFullYear();
  const q = search.q ?? Math.floor(now.getMonth() / 3) + 1;
  const setYear = (y: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, year: y }), replace: true } as never);
  const setQ = (n: number) =>
    go({ to: ".", search: (p: object) => ({ ...p, q: n }), replace: true } as never);
  const r = useQuery(vatReportQuery(year, q));
  const [settings, setSettings] = useState(false);
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
        <div className="flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="الربع">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={q === n}
              onClick={() => setQ(n)}
              className={`min-h-10 min-w-11 rounded-md px-3 py-1.5 text-sm sm:min-h-0 sm:min-w-0 ${q === n ? "bg-brand text-white dark:text-canvas" : "text-muted hover:text-ink"}`}
            >
              ر{n}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setSettings(true)}>
          <Settings2 className="size-4" /> إعدادات الضريبة
        </Button>
        <Link
          to="/finance/vat/report"
          search={{ year, q }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong dark:text-canvas"
        >
          <FileText className="size-4" /> تقرير الضريبة
        </Link>
      </div>
    </div>
  );

  if (r.isPending)
    return (
      <div className="space-y-4">
        {bar}
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  if (r.isError || !r.data)
    return (
      <EmptyState
        title="تعذّر تحميل الضريبة"
        action={<Button onClick={() => r.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const v = r.data;
  return (
    <div className="space-y-6">
      {bar}
      <p className="text-sm text-muted">
        {v.period.label} · ضريبة المبيعات بتاريخ استلام كل دفعة، والمشتريات بتاريخ فاتورتها · النسبة
        الحالية {v.rate}%
      </p>
      {v.warnings.length > 0 && (
        <Notice tone="amber">
          <ul className="space-y-1">
            {v.warnings.map((w) => (
              <li key={w.code} className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {WARNING[w.code](w.count)}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile title="مبيعات خاضعة (قبل الضريبة)" value={sar(v.sales.base)} />
        <Tile title="ضريبة المبيعات المستحقة" value={sar(v.outputVat)} />
        <Tile title="مشتريات خاضعة (قبل الضريبة)" value={sar(v.purchases.base)} />
        <Tile title="ضريبة المشتريات القابلة للخصم" value={sar(v.inputVat)} />
        <Tile
          title={v.netPayable >= 0 ? "صافي الضريبة المستحقة للهيئة" : "صافي الضريبة المستردة"}
          value={sar(Math.abs(v.netPayable))}
          tone={v.netPayable > 0 ? "warn" : "good"}
        />
      </div>
      <Sales v={v} />
      <Purchases v={v} />
      <Unidentified v={v} />
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </div>
  );
}

function Sales({ v }: { v: VatReport }) {
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">المبيعات: الاستلامات المعتمدة في الربع</h2>
        <p className="text-xs text-muted">
          لكل استلام نصيبه من ضريبة عقده بنسبة ما استُلم منه؛ الاسترجاع يخفضها.
        </p>
      </div>
      {v.sales.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">لا استلامات معتمدة في هذا الربع.</p>
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
                <tr key={s.receiptId} className="border-b last:border-0">
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
                    <span className="block text-xs text-muted">{s.clientName}</span>
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
        <h2 className="font-semibold">المشتريات: المصروفات التي لها فاتورة ضريبية</h2>
        <p className="text-xs text-muted">
          من أي مشروع. لتسجيل فاتورة لمصروف افتحوه من صفحة مشروعه واختاروا «له فاتورة ضريبية»، أو من
          القائمة أدناه.
        </p>
      </div>
      {v.purchases.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          لا مشتريات بفواتير ضريبية في هذا الربع.
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
                  onClick={() => setEdit(p)}
                  onKeyDown={(k) => k.key === "Enter" && setEdit(p)}
                  tabIndex={0}
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
  if (v.unidentified.rows.length === 0) return null;
  return (
    <Card className="p-0">
      <div className="px-5 pt-5">
        <h2 className="font-semibold">مصروفات لم تُحدَّد بعد ({v.unidentified.rows.length})</h2>
        <p className="text-xs text-muted">
          مصروفات الربع التي لم تُسجَّل لها فاتورة ضريبية (دون الرواتب وبنود الاتفاقية). إن كان لأحدها
          فاتورة، اختاروه وفعّلوا «له فاتورة ضريبية».
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
              <Button variant="secondary" onClick={() => setEdit(u)}>
                له فاتورة ضريبية
              </Button>
            </span>
          </li>
        ))}
      </ul>
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

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const s = useQuery(vatSettingsQuery);
  const [rate, setRate] = useState<string | null>(null);
  const [period, setPeriod] = useState<"quarterly" | "monthly" | null>(null);
  const [err, setErr] = useState("");
  if (!s.data) return null;
  const r = rate ?? String(s.data.rate);
  const p = period ?? s.data.period;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="إعدادات الضريبة"
      footer={
        <DialogActions onCancel={onClose}>
          <Button
            onClick={async () => {
              const n = Number(r);
              if (!(n >= 0 && n <= 100)) return setErr("النسبة بين 0 و100");
              try {
                await saveVatSettings({ rate: n, period: p });
                await qc.invalidateQueries({ queryKey: vatKeys.all });
                onClose();
              } catch {
                setErr("تعذّر الحفظ");
              }
            }}
          >
            حفظ
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نسبة الضريبة %" hint="تُطبَّق على المشتريات الجديدة؛ لا تتغير فواتير سُجّلت سابقاً">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            dir="ltr"
            value={r}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="دورة الإقرار">
          <Select value={p} onChange={(e) => setPeriod(e.target.value as "quarterly")}>
            <option value="quarterly">ربع سنوي</option>
            <option value="monthly">شهري</option>
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-sm">
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
      <p className="mt-2 text-xs text-muted">
        ضريبة العقد نفسه (النسبة وهل هي شاملة) تُضبط لكل مشروع من «إعدادات العقد» في صفحته.
      </p>
    </Dialog>
  );
}
