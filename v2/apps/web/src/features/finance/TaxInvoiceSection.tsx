import { Field, Input } from "../../components/ui";
import { sar } from "../../lib/format";

export type TaxInvoiceForm = {
  vatAmount: string;
  /** The user typed the VAT; otherwise it is worked out from the amount at the org's rate. */
  vatEdited: boolean;
  supplierName: string;
  supplierVatNo: string;
  invoiceNo: string;
  invoiceDate: string;
};
const EMPTY: TaxInvoiceForm = {
  vatAmount: "",
  vatEdited: false,
  supplierName: "",
  supplierVatNo: "",
  invoiceNo: "",
  invoiceDate: "",
};

/**
 * «له فاتورة ضريبية»: marks a purchase as one with a tax invoice. Its VAT is then worked out
 * (the amount is taken to include VAT) and the purchase appears in the VAT report. Separate
 * from «يحتوي على ربح» / the 13.043% button, which are untouched.
 */
export function TaxInvoiceSection({
  value,
  onChange,
  amount,
  rate,
}: {
  value: TaxInvoiceForm | null;
  onChange: (v: TaxInvoiceForm | null) => void;
  amount: number;
  rate: number;
}) {
  const auto = rate > 0 ? Math.round(((amount * rate) / (100 + rate)) * 100) / 100 : 0;
  const set = (patch: Partial<TaxInvoiceForm>) => value && onChange({ ...value, ...patch });
  return (
    <section className="rounded-lg border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? { ...EMPTY } : null)}
          className="size-4 accent-[var(--color-brand)]"
        />
        له فاتورة ضريبية
      </label>
      {value && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="اسم المورد">
            <Input
              value={value.supplierName}
              onChange={(e) => set({ supplierName: e.target.value })}
            />
          </Field>
          <Field label="الرقم الضريبي للمورد" hint="15 رقماً يبدأ وينتهي بـ 3">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={value.supplierVatNo}
              onChange={(e) => set({ supplierVatNo: e.target.value })}
            />
          </Field>
          <Field label="رقم الفاتورة">
            <Input
              dir="ltr"
              value={value.invoiceNo}
              onChange={(e) => set({ invoiceNo: e.target.value })}
            />
          </Field>
          <Field label="تاريخ الفاتورة" hint="يحدد ربع الضريبة">
            <Input
              type="date"
              value={value.invoiceDate}
              onChange={(e) => set({ invoiceDate: e.target.value })}
            />
          </Field>
          <Field
            label="مبلغ الضريبة (ر.س)"
            className="sm:col-span-2"
            hint={
              value.vatEdited
                ? "مبلغ أدخلتموه بأنفسكم"
                : `محسوب تلقائياً: ${sar(auto)} (المبلغ شامل ${rate}%)`
            }
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              dir="ltr"
              value={value.vatEdited ? value.vatAmount : String(auto)}
              onChange={(e) => set({ vatAmount: e.target.value, vatEdited: true })}
            />
          </Field>
        </div>
      )}
    </section>
  );
}
