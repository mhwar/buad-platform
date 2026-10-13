import { CATEGORY_LABELS, entryInput, VAT_EXTRACT_PCT } from "@buad/schema/finance";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Notice,
  Select,
  Tabs,
  Textarea,
} from "../../components/ui";
import { ApiError, sar, today } from "../../lib/format";
import { type Entry, type Finance, financeApi, financeKey } from "./api";

type Form = z.input<typeof entryInput>;
const BUILTIN = [
  "salary",
  "logistics",
  "materials",
  "other",
  "exec",
  "mkt",
  "cashback",
  "cf",
  "vat",
];
const msg: Record<string, string> = {
  required: "الوصف مطلوب",
  amount_positive: "المبلغ يجب أن يكون أكبر من صفر",
};

/** Add or edit an entry (v1 «إضافة قيد مالي»), with the «من الاتفاقية» tab for contract items. */
export function EntryDialog({
  open,
  onOpenChange,
  projectId,
  fin,
  existing,
  startTab = "new",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  fin: Finance;
  existing?: Entry;
  startTab?: "new" | "agreement";
}) {
  const qc = useQueryClient();
  const api = financeApi(projectId);
  const [tab, setTab] = useState<"new" | "agreement">(startTab);
  const [error, setError] = useState<string | null>(null);
  const defaults: Form = existing
    ? {
        date: existing.date,
        description: existing.description,
        cat: existing.cat,
        type: existing.type,
        amount: existing.amount / 100,
        profitMargin: existing.profitMargin,
        profitMarginType: existing.profitMarginType,
        status: existing.status,
        note: existing.note,
      }
    : {
        date: today(),
        description: "",
        cat: "other",
        type: "expense",
        amount: 0,
        profitMargin: 0,
        profitMarginType: "pct",
        status: "",
        note: "",
      };
  const f = useForm<Form>({ resolver: zodResolver(entryInput), values: defaults });
  const [hasProfit, setHasProfit] = useState(!!existing?.profitMargin);
  const type = f.watch("type");
  const e = f.formState.errors;

  const close = (v: boolean) => {
    if (!v) {
      setError(null);
      setTab(startTab);
      f.reset(defaults);
    }
    onOpenChange(v);
  };
  const apply = (res: Finance) => qc.setQueryData(financeKey(projectId), res);

  const save = f.handleSubmit(async (v) => {
    setError(null);
    const body = { ...v, profitMargin: hasProfit ? v.profitMargin : 0 };
    try {
      apply(existing ? await api.updateEntry(existing.id, body) : await api.addEntry(body));
      close(false);
    } catch {
      setError("تعذّر الحفظ، حاولوا مرة أخرى");
    }
  });
  const remove = async () => {
    if (!existing || !confirm("حذف هذا القيد؟")) return;
    apply(await api.deleteEntry(existing.id));
    close(false);
  };
  const register = async (item: string) => {
    setError(null);
    try {
      apply(await api.registerAgreement(item));
    } catch (x) {
      setError(
        x instanceof ApiError && x.body.error === "zero_amount"
          ? "قيمة هذا البند صفر"
          : "تعذّر التسجيل",
      );
    }
  };

  // Categories shown for the chosen type: custom ones respect their income/expense setting.
  const custom = fin.categories.filter((c) => c.type === "both" || c.type === type);
  const budgetCats = fin.budget.filter((b) => b.name && b.amount > 0);
  const registered = new Set(fin.entries.filter((x) => x.source === "agreement").map((x) => x.cat));
  const s = fin.summary;
  const agreement = [
    { item: "exec", label: "أتعاب التنفيذ", amount: s.execAmt, kind: "دخل", always: true },
    { item: "cf", label: "ضريبة القيمة المضافة", amount: s.cfAmt, kind: "مصروف" },
    { item: "mkt", label: "التسويق", amount: s.mkt, kind: "مصروف" },
    { item: "cashback", label: "كاش باك", amount: s.cb, kind: "مصروف" },
  ].filter((a) => a.always || a.amount > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={existing ? "تعديل القيد" : "إضافة قيد مالي"}
      wide
    >
      {!existing && (
        <Tabs
          items={[
            { to: "", label: "بند جديد", active: tab === "new", onClick: () => setTab("new") },
            {
              to: "",
              label: "من الاتفاقية",
              active: tab === "agreement",
              onClick: () => setTab("agreement"),
            },
          ]}
        />
      )}
      {error && <Notice>{error}</Notice>}
      {tab === "agreement" && !existing ? (
        <table className="w-full text-sm">
          <thead className="border-b text-right text-xs text-muted">
            <tr>
              <th className="p-2 font-medium">البند</th>
              <th className="p-2 font-medium">المبلغ</th>
              <th className="p-2 font-medium">النوع</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {[
              ...agreement.map((a) => ({
                key: a.item,
                label: a.label,
                amount: a.amount,
                kind: a.kind,
              })),
              ...budgetCats.map((b) => ({
                key: `bdg_${b.id}`,
                label: b.name,
                amount: b.amount / 100,
                kind: "مصروف",
              })),
            ].map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="p-2">{r.label}</td>
                <td className="p-2" dir="ltr">
                  {sar(r.amount)}
                </td>
                <td className="p-2">
                  <Badge tone={r.kind === "دخل" ? "green" : "amber"}>{r.kind}</Badge>
                </td>
                <td className="p-2 text-left">
                  {registered.has(r.key) ? (
                    <Badge tone="blue">✓ مسجّل</Badge>
                  ) : (
                    <Button onClick={() => register(r.key)} disabled={r.amount <= 0}>
                      تسجيل
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ">
              <Input type="date" {...f.register("date")} />
            </Field>
            <Field label="النوع">
              <Select {...f.register("type")}>
                <option value="expense">مصروف</option>
                <option value="income">دخل</option>
              </Select>
            </Field>
            <Field
              label="الوصف *"
              error={
                e.description?.message
                  ? (msg[e.description.message] ?? "قيمة غير صحيحة")
                  : undefined
              }
              className="sm:col-span-2"
            >
              <Input autoFocus {...f.register("description")} />
            </Field>
            <Field label="التصنيف">
              <Select {...f.register("cat")}>
                {BUILTIN.map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABELS[k]}
                  </option>
                ))}
                {custom.length > 0 && (
                  <optgroup label="تصنيفات مخصصة">
                    {custom.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                {budgetCats.length > 0 && (
                  <optgroup label="بنود الميزانية">
                    {budgetCats.map((b) => (
                      <option key={b.id} value={`bdg_${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
            <Field label="المبلغ (ر.س) *" error={e.amount ? msg.amount_positive : undefined}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                dir="ltr"
                {...f.register("amount")}
              />
            </Field>
            <Field label="الحالة">
              <Select {...f.register("status")}>
                <option value="">—</option>
                <option value="paid">مدفوع</option>
                <option value="pending">معلق</option>
                <option value="cancelled">ملغي</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
              <input
                type="checkbox"
                checked={hasProfit}
                onChange={(ev) => setHasProfit(ev.target.checked)}
                className="size-4 accent-[var(--color-brand)]"
              />
              يحتوي على ربح
            </label>
            {hasProfit && (
              <div className="grid grid-cols-[1fr_auto] items-end gap-2 sm:col-span-2">
                <Field label="هامش الربح">
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    dir="ltr"
                    {...f.register("profitMargin")}
                  />
                </Field>
                <Select
                  aria-label="نوع هامش الربح"
                  {...f.register("profitMarginType")}
                  className="w-auto"
                >
                  <option value="pct">%</option>
                  <option value="fixed">مبلغ ثابت</option>
                </Select>
                <Button
                  variant="ghost"
                  className="col-span-2 justify-self-start"
                  onClick={() => {
                    f.setValue("profitMargin", VAT_EXTRACT_PCT);
                    f.setValue("profitMarginType", "pct");
                  }}
                >
                  احتساب نسبة الضريبة {VAT_EXTRACT_PCT}%
                </Button>
              </div>
            )}
          </div>
          <Field label="ملاحظة">
            <Textarea rows={2} {...f.register("note")} />
          </Field>
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            {existing ? (
              <Button variant="ghost" className="text-red-600" onClick={remove}>
                حذف القيد
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => close(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={f.formState.isSubmitting}>
                {existing ? "حفظ التعديل" : "إضافة القيد"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
}
