import { quarterLabelOf, receiptWarnings } from "@buad/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, DialogActions, Field, Input, Notice, toast } from "../../components/ui";
import { sar } from "../../lib/format";
import { send } from "../team/queries";

const WARNING = {
  future: "التاريخ في المستقبل.",
  before_contract: "التاريخ قبل تاريخ العقد.",
  near_quarter_edge: "قريب من حدّ الربع؛ تأكد أنه في الربع الصحيح.",
} as const;

/**
 * «تم الاستلام» for one instalment: the day the money reached the bank (it decides the quarter
 * and the VAT period) and how much came — less than the line keeps the rest as a new instalment.
 */
export function ReceiveDialog({
  line,
  contractDate = "",
  onClose,
  onDone,
}: {
  line: { id: string; label: string; amount: number; dueDate: string };
  contractDate?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(line.amount));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const rest = Math.round((line.amount - n) * 100) / 100;
  const warnings = date ? receiptWarnings(date, contractDate, today) : [];
  const save = async () => {
    if (!date || !(n > 0)) return setError("أدخل التاريخ والمبلغ.");
    if (n > line.amount) return setError("المبلغ أكبر من الدفعة.");
    setBusy(true);
    setError("");
    try {
      await send("POST", `/api/receivables/${line.id}/receive`, { date, amount: n });
      for (const k of ["receivables", "schedule", "attention", "finance", "year-review"])
        qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["company-finance"] });
      toast(rest > 0 ? "سُجّل الاستلام الجزئي" : "سُجّل الاستلام");
      onDone?.();
      onClose();
    } catch {
      setError("تعذّر تسجيل الاستلام.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`استلام ${line.label}`}
      footer={
        <DialogActions onCancel={onClose}>
          <Button onClick={save} disabled={busy}>
            تسجيل الاستلام
          </Button>
        </DialogActions>
      }
    >
      {error && <Notice>{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="تاريخ وصوله للبنك" hint="يحدد ربع السنة وفترة الضريبة">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="المبلغ المستلم (ر.س)" hint={`الدفعة ${sar(line.amount)}`}>
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <div className="space-y-1 text-sm sm:col-span-2" aria-live="polite">
          {date && (
            <p className="rounded-lg bg-brand-soft px-3 py-2">
              يقع في <b>{quarterLabelOf(date)}</b>
            </p>
          )}
          {n > 0 && rest > 0 && (
            <p className="text-amber-700 dark:text-amber-300">
              استلام جزئي: يبقى {sar(rest)} دفعةً منتظرة بنفس الموعد.
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-300">
              ⚠ {WARNING[w]}
            </p>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
