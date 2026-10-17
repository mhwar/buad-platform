import { quarterLabelOf, receiptWarnings } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  cx,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { day, sar } from "../../lib/format";
import { withOverContractCheck } from "../finance/api";
import { projectsQuery } from "../projects/api";
import { send } from "../team/queries";
import { type Instalment, scheduleQuery } from "./api";

const WARNING = {
  future: "التاريخ في المستقبل.",
  before_contract: "التاريخ قبل تاريخ العقد.",
  near_quarter_edge: "قريب من حدّ الربع؛ تأكد أنه في الربع الصحيح.",
} as const;
const FREE = "free";

/**
 * «تسجيل مقبوض»: the one way to record money that came in, from anywhere.
 * Pick the project (unless already on it); if it has instalments waiting, they are offered first
 * (receiving one closes it, or part of it), otherwise an amount is recorded on its own.
 * The date is the day the money reached the bank: it decides the quarter and the VAT period.
 */
export function ReceiptFlow({
  project,
  onClose,
  onDone,
}: {
  /** Already known (from a project page or the year review). */
  project?: { id: string; name: string; remaining?: number; contractDate?: string };
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [pickedId, setPickedId] = useState(project?.id ?? "");
  const list = useQuery({ ...projectsQuery({}), enabled: !project });
  const candidates = (list.data?.items ?? []).filter(
    (p) => p.status !== "draft" && p.status !== "cancelled",
  );
  const picked =
    project ??
    (() => {
      const p = candidates.find((x) => x.id === pickedId);
      return p
        ? {
            id: p.id,
            name: p.name,
            remaining:
              p.received == null ? undefined : Math.max(0, (p.contractTotal - p.received) / 100),
            contractDate: "",
          }
        : undefined;
    })();
  const lines = useQuery({ ...scheduleQuery(picked?.id ?? ""), enabled: !!picked });
  const pending = (lines.data ?? []).filter((i) => i.status === "pending");
  const [choice, setChoice] = useState<string>("");
  const line: Instalment | undefined = pending.find((l) => l.id === choice);
  // The first waiting instalment is suggested; otherwise a free amount.
  const chosen = choice || (pending[0]?.id ?? FREE);
  const active = pending.find((l) => l.id === chosen) ?? line;
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suggested = active ? active.amount : (picked?.remaining ?? 0);
  const n = Number(amount || suggested);
  const rest = active ? Math.round((active.amount - n) * 100) / 100 : 0;
  const warnings = date ? receiptWarnings(date, picked?.contractDate ?? "", today) : [];

  const save = async () => {
    if (!picked) return setError("اختر المشروع.");
    if (!date || !(n > 0)) return setError("أدخل التاريخ والمبلغ.");
    if (active && n > active.amount) return setError("المبلغ أكبر من الدفعة.");
    setBusy(true);
    setError("");
    try {
      if (active) await send("POST", `/api/receivables/${active.id}/receive`, { date, amount: n });
      else if (
        !(await withOverContractCheck((confirmOver) =>
          send("POST", `/api/projects/${picked.id}/finance/receipts`, {
            date,
            amount: n,
            note,
            basis: "",
            confirmOver,
          }),
        ))
      )
        return setBusy(false);
      for (const k of [
        "receivables",
        "schedule",
        "attention",
        "finance",
        "year-review",
        "projects",
        "company-finance",
        "finance-overview",
      ])
        qc.invalidateQueries({ queryKey: [k] });
      toast(active && rest > 0 ? "سُجّل المقبوض، وبقي الباقي دفعةً منتظرة" : "سُجّل المقبوض");
      onDone?.();
      onClose();
    } catch {
      setError("تعذّر تسجيل المقبوض.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={picked ? `تسجيل مقبوض — ${picked.name}` : "تسجيل مقبوض"}
      footer={
        <DialogActions onCancel={onClose}>
          <Button onClick={save} disabled={busy || !picked}>
            تسجيل المقبوض
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {!project && (
          <Field label="المشروع">
            <Select
              value={pickedId}
              onChange={(e) => {
                setPickedId(e.target.value);
                setChoice("");
                setAmount("");
              }}
            >
              <option value="">اختر المشروع…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.clientName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {picked && pending.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">من أي دفعة؟</legend>
            {[
              ...pending.map((l) => ({
                id: l.id,
                label: l.label,
                sub: `${l.dueDate < today ? "متأخرة · " : "تستحق "}${day(l.dueDate)} · ${sar(l.amount)}`,
                late: l.dueDate < today,
              })),
              { id: FREE, label: "مبلغ غير مجدول", sub: "لا يغلق أي دفعة", late: false },
            ].map((o) => (
              <label
                key={o.id}
                className={cx(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2",
                  chosen === o.id ? "border-brand bg-brand-soft/60" : "hover:bg-brand-soft/40",
                )}
              >
                <input
                  type="radio"
                  name="receipt-line"
                  checked={chosen === o.id}
                  onChange={() => {
                    setChoice(o.id);
                    setAmount("");
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span
                    className={cx(
                      "block text-xs",
                      o.late ? "font-semibold text-red-600" : "text-muted",
                    )}
                  >
                    {o.sub}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {picked && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="تاريخ وصوله للبنك" hint="يحدد ربع السنة وفترة الضريبة">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field
              label="المبلغ (ر.س، شامل الضريبة)"
              hint={
                active
                  ? `الدفعة ${sar(active.amount)}`
                  : picked.remaining
                    ? `المتبقي على المشروع ${sar(picked.remaining)}`
                    : undefined
              }
            >
              <Input
                type="number"
                inputMode="decimal"
                dir="ltr"
                value={amount || (suggested ? String(suggested) : "")}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            {!active && (
              <Field label="ملاحظة" className="sm:col-span-2">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="الدفعة الأولى…"
                />
              </Field>
            )}
            <div className="space-y-1 text-sm sm:col-span-2" aria-live="polite">
              {date && (
                <p className="rounded-lg bg-brand-soft px-3 py-2">
                  يقع في <b>{quarterLabelOf(date)}</b>
                </p>
              )}
              {active && n > 0 && rest > 0 && (
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
        )}
      </div>
    </Dialog>
  );
}
