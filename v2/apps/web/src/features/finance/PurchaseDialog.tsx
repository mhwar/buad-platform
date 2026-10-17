import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { today } from "../../lib/format";
import { vatSettingsQuery } from "../finance-overview/vat-api";
import { projectsQuery } from "../projects/api";
import { type TaxInvoiceForm, TaxInvoiceSection } from "./TaxInvoiceSection";

const COMPANY = "__company__";
const PROJECT_CATS = [
  ["materials", "مواد ومشتريات"],
  ["logistics", "لوجستيات"],
  ["mkt", "تسويق"],
  ["salary", "رواتب وأجور"],
  ["other", "أخرى"],
] as const;
const COMPANY_CATS = [
  ["purchase", "مشتريات عامة"],
  ["asset", "أصل رأسمالي (أجهزة، أثاث…)"],
  ["tools", "خدمات وأدوات"],
  ["hosting", "استضافة وبنية تحتية"],
  ["marketing", "تسويق وإعلان"],
  ["payroll", "رواتب وأجور"],
  ["other", "أخرى"],
] as const;

/**
 * «فاتورة مشتريات / مصروف» from «+»: one form for any bill. On a project it becomes one of the
 * project's entries; otherwise a company expense. With a tax invoice its VAT goes into the VAT
 * return of the invoice's quarter, by itself.
 */
export function PurchaseDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const list = useQuery(projectsQuery({}));
  const rate = useQuery(vatSettingsQuery).data?.rate ?? 15;
  const projects = (list.data?.items ?? []).filter(
    (p) => !p.closedAt && !p.archivedAt && p.status !== "draft" && p.status !== "cancelled",
  );
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [cat, setCat] = useState("materials");
  const [ti, setTi] = useState<TaxInvoiceForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const onCompany = target === COMPANY;
  const cats = onCompany ? COMPANY_CATS : PROJECT_CATS;

  const save = async () => {
    const n = Number(amount);
    if (!target) return setErr("اختاروا المشروع أو «الشركة».");
    if (!description.trim() || !(n > 0)) return setErr("أدخلوا البيان والمبلغ.");
    const taxInvoice = ti
      ? {
          ...(ti.vatEdited ? { vatAmount: Number(ti.vatAmount) || 0 } : {}),
          supplierName: ti.supplierName,
          supplierVatNo: ti.supplierVatNo,
          invoiceNo: ti.invoiceNo,
          invoiceDate: ti.invoiceDate || date,
        }
      : null;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(
        onCompany ? "/api/finance/company/entries" : `/api/projects/${target}/finance/entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            onCompany
              ? {
                  type: "expense",
                  category: cat,
                  date,
                  description: description.trim(),
                  amount: n,
                  taxInvoice,
                }
              : {
                  type: "expense",
                  cat,
                  date,
                  description: description.trim(),
                  amount: n,
                  status: "paid",
                  taxInvoice,
                },
          ),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "failed");
      }
      for (const k of ["finance", "company-finance", "vat", "finance-overview"])
        qc.invalidateQueries({ queryKey: [k] });
      toast(ti ? "سُجّلت الفاتورة ودخلت ضريبتها في الإقرار" : "سُجّل المصروف");
      onClose();
    } catch (x) {
      setErr(
        (x as Error).message === "project_closed"
          ? "المشروع مغلق: أعيدوا فتحه أولاً."
          : "تعذّر الحفظ، راجعوا البيانات.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="فاتورة مشتريات أو مصروف"
      footer={
        <DialogActions onCancel={onClose}>
          <Button disabled={busy} onClick={save}>
            حفظ
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="على أي مشروع؟" className="sm:col-span-2">
          <Select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setCat(e.target.value === COMPANY ? "purchase" : "materials");
            }}
          >
            <option value="">اختاروا…</option>
            <option value={COMPANY}>الشركة (خارج المشاريع)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="البيان" className="sm:col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="النوع">
          <Select value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="التاريخ">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="المبلغ شامل الضريبة (ر.س)" className="sm:col-span-2">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4">
        <TaxInvoiceSection value={ti} onChange={setTi} amount={Number(amount) || 0} rate={rate} />
        <p className="mt-2 text-xs text-muted">
          بفاتورة ضريبية تدخل ضريبتها تلقائياً في إقرار ربع تاريخ الفاتورة ضمن «ضريبة المشتريات».
        </p>
      </div>
    </Dialog>
  );
}
