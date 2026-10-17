import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Button,
  confirmAction,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { day, sar, today } from "../../lib/format";
import { invoicesQuery, type SalesInvoice, vatApi, vatKeys } from "../finance-overview/vat-api";
import { uploadImage } from "../org/OrgSettings";
import { financeQuery } from "./api";

/**
 * «الفواتير الضريبية»: the tax invoices sent to this client. Their date decides the quarter of
 * the output VAT; until one is recorded, the project's receipts stand in for them.
 */
export function SalesInvoices({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const q = useQuery(invoicesQuery(projectId));
  const [editing, setEditing] = useState<SalesInvoice | "new" | null>(null);
  const items = q.data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        الفواتير الضريبية المرسلة للعميل: تاريخها يحدد ربع ضريبة المبيعات. ما لم تُسجَّل فاتورة، تُحتسب
        ضريبة المشروع بتاريخ كل استلام.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">لا فواتير مسجّلة.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing(i)}
                className="flex w-full items-center justify-between gap-2 p-2.5 text-right hover:bg-brand-soft/50 disabled:cursor-default"
              >
                <span>
                  {day(i.date)} · <span dir="ltr">{i.number || "بلا رقم"}</span>
                  <span className="block text-xs text-muted">
                    منها ضريبة {sar(i.vat)}
                    {i.assetId && (
                      <>
                        {" "}
                        · <Paperclip className="inline size-3" /> مرفقة
                      </>
                    )}
                  </span>
                </span>
                <b>{sar(i.amount)}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> فاتورة ضريبية مرسلة
        </Button>
      )}
      {editing && (
        <InvoiceDialog
          projectId={projectId}
          invoice={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function InvoiceDialog({
  projectId,
  invoice,
  onClose,
}: {
  projectId: string;
  invoice: SalesInvoice | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fin = useQuery(financeQuery(projectId));
  const receipts = (fin.data?.receipts ?? []).filter((r) => r.approvedAt && r.amount > 0);
  const [number, setNumber] = useState(invoice?.number ?? "");
  const [date, setDate] = useState(invoice?.date ?? today());
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : "");
  const [vat, setVat] = useState(invoice ? String(invoice.vat) : "");
  const [receiptId, setReceiptId] = useState(invoice?.receiptId ?? "");
  const [assetId, setAssetId] = useState(invoice?.assetId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const done = async (message: string) => {
    await qc.invalidateQueries({ queryKey: vatKeys.all });
    toast(message);
    onClose();
  };
  const save = async () => {
    const n = Number(amount);
    if (!date || !(n > 0)) return setErr("أدخلوا التاريخ والمبلغ");
    const body = {
      projectId,
      number: number.trim(),
      date,
      amount: n,
      ...(vat.trim() ? { vat: Number(vat) } : {}),
      receiptId,
      assetId,
      note: invoice?.note ?? "",
    };
    try {
      if (invoice) await vatApi.updateInvoice(invoice.id, body);
      else await vatApi.addInvoice(body);
      await done(invoice ? "حُفظت الفاتورة" : "سُجّلت الفاتورة");
    } catch {
      setErr("تعذّر الحفظ");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={invoice ? "فاتورة ضريبية مرسلة" : "تسجيل فاتورة ضريبية مرسلة"}
      footer={
        <DialogActions
          onCancel={onClose}
          aside={
            invoice && (
              <Button
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  if (
                    !(await confirmAction({
                      title: "حذف هذه الفاتورة؟",
                      action: "حذف",
                      danger: true,
                    }))
                  )
                    return;
                  await vatApi.deleteInvoice(invoice.id);
                  await done("حُذفت الفاتورة");
                }}
              >
                <Trash2 className="size-4" /> حذف
              </Button>
            )
          }
        >
          <Button onClick={save} disabled={busy}>
            حفظ
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم الفاتورة">
          <Input dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="تاريخ الفاتورة" hint="يحدد ربع ضريبة المبيعات">
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
        <Field label="الضريبة (ر.س)" hint="فارغ = تُحسب بنسبة المشروع">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
          />
        </Field>
        <Field label="سُدِّدت بالاستلام" className="sm:col-span-2">
          <Select value={receiptId} onChange={(e) => setReceiptId(e.target.value)}>
            <option value="">— غير محدد —</option>
            {receipts.map((r) => (
              <option key={r.id} value={r.id}>
                {day(r.date)} · {sar(r.amount / 100)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1 text-sm font-medium">الفاتورة المرسلة (PDF أو صورة)</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm hover:bg-brand-soft">
              <FileText className="size-4" />
              {busy ? "جارٍ الرفع…" : assetId ? "استبدال الملف" : "رفع الملف"}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    setAssetId((await uploadImage(file)).id);
                  } catch {
                    setErr("تعذّر رفع الملف (PDF أو صورة حتى 2MB)");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {assetId && (
              <a
                href={`/api/assets/${assetId}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand underline"
              >
                عرض المرفق
              </a>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
