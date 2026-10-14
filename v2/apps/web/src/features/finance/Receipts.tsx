import { quarterLabelOf, receiptWarnings } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Button, Card, Dialog, Field, Input, Notice } from "../../components/ui";
import { day, fromEpoch, sar, today } from "../../lib/format";
import { financeApi, financeKey, financeQuery, type Receipt } from "./api";

/**
 * «الاستلامات من العميل»: the money that reached the bank for this project. A project's
 * profit counts as realized (and can be distributed) in proportion to what was received.
 */
export function ReceiptsCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const q = useQuery(financeQuery(projectId));
  const [editing, setEditing] = useState<Receipt | "new" | null>(null);
  if (!q.data) return null;
  const f = q.data;
  const gross = f.summary.grossTotal;
  const share = gross > 0 ? Math.min(100, Math.max(0, (f.received / gross) * 100)) : 0;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Wallet className="size-4" /> الاستلامات من العميل
        </h2>
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> تسجيل استلام
          </Button>
        )}
      </div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>
          استُلم {sar(f.received)} من {sar(gross)}
        </span>
        <span>{share.toFixed(0)}%</span>
      </div>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
      </div>
      <p className="mb-3 text-sm">
        المتبقي على العميل: <b>{sar(Math.max(0, gross - f.received))}</b>
      </p>
      {f.receipts.length === 0 ? (
        <p className="text-xs text-muted">
          لم يُسجَّل استلام بعد. الربح يُعدّ متحققاً (وقابلاً للتوزيع) بقدر ما يُستلم من قيمة العقد.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {f.receipts.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing(r)}
                className="flex w-full items-center justify-between gap-2 p-2.5 text-right hover:bg-brand-soft/50 disabled:cursor-default"
              >
                <span>
                  {day(r.date)}{" "}
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand">
                    {quarterLabelOf(r.date)}
                  </span>
                  {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                  {r.approvedAt && (
                    <span className="block text-[11px] text-muted">
                      اعتُمد {fromEpoch(r.approvedAt)}
                      {r.basis && ` · ${r.basis}`}
                    </span>
                  )}
                </span>
                <b className={r.amount < 0 ? "text-red-600 dark:text-red-400" : ""}>
                  {r.amount < 0 ? "استرجاع " : ""}
                  {sar(Math.abs(r.amount) / 100)}
                </b>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ReceiptDialog
          projectId={projectId}
          receipt={editing === "new" ? null : editing}
          remaining={Math.max(0, gross - f.received)}
          contractDate={f.ctrl.contractDate}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

const WARNING: Record<string, string> = {
  future: "التاريخ في المستقبل",
  before_contract: "التاريخ قبل تاريخ العقد",
  near_quarter_edge: "قريب من حدّ الربع: تأكدوا من اليوم لأنه يحدد الربع",
};

/** Verify and approve a receipt: the date decides the quarter, so it is shown while you type. */
export function ReceiptDialog({
  projectId,
  receipt,
  remaining,
  onClose,
  suggestion,
  contractDate = "",
}: {
  projectId: string;
  receipt: Receipt | null;
  remaining: number;
  onClose: () => void;
  /** A proposal being approved: prefills the date and keeps where it came from. */
  suggestion?: { date: string; basis: string };
  contractDate?: string;
}) {
  const qc = useQueryClient();
  const api = financeApi(projectId);
  const [date, setDate] = useState(receipt?.date ?? suggestion?.date ?? today());
  const [amount, setAmount] = useState(
    receipt ? String(Math.abs(receipt.amount) / 100) : remaining ? String(remaining) : "",
  );
  const [refund, setRefund] = useState((receipt?.amount ?? 1) < 0);
  const [note, setNote] = useState(receipt?.note ?? "");
  const [err, setErr] = useState("");
  const warnings = date ? receiptWarnings(date, contractDate, today()) : [];
  const done = (fin: unknown) => {
    qc.setQueryData(financeKey(projectId), fin);
    qc.invalidateQueries({ queryKey: ["company-finance"] });
    qc.invalidateQueries({ queryKey: ["finance-overview"] });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={receipt ? "تعديل استلام" : "تسجيل استلام من العميل"}
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="تاريخ وصوله للبنك" hint="يحدد ربع السنة الذي يتحقق فيه ربحه">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="sm:col-span-2" aria-live="polite">
          {date && (
            <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm">
              يقع هذا الاستلام في <b>{quarterLabelOf(date)}</b>
              {suggestion && <span className="block text-xs text-muted">{suggestion.basis}</span>}
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              ⚠ {WARNING[w]}
            </p>
          ))}
        </div>
        <Field label="المبلغ (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          استرجاع للعميل (يُخصم من المستلم)
        </label>
        <Field label="ملاحظة" className="sm:col-span-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="الدفعة الأولى…"
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-between gap-2">
        {receipt ? (
          <Button
            variant="secondary"
            onClick={async () => {
              if (!confirm("حذف هذا الاستلام؟")) return;
              done(await api.deleteReceipt(receipt.id));
            }}
          >
            <Trash2 className="size-4" /> حذف
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={async () => {
            const n = Number(amount);
            if (!date || !(n > 0)) return setErr("أدخلوا التاريخ والمبلغ");
            const body = {
              date,
              amount: refund ? -n : n,
              note,
              basis: suggestion?.basis ?? receipt?.basis ?? "",
            };
            try {
              done(
                receipt ? await api.updateReceipt(receipt.id, body) : await api.addReceipt(body),
              );
            } catch {
              setErr("تعذّر الحفظ");
            }
          }}
        >
          {suggestion ? "اعتماد الاستلام" : "حفظ"}
        </Button>
      </div>
    </Dialog>
  );
}
