import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Textarea,
  toast,
} from "../../components/ui";
import { ok, sar } from "../../lib/format";
import { DistributionWizard } from "../finance-overview/PartnersTab";

type Check = {
  closed: { at: number; by: string; note: string } | null;
  figures: {
    gross: number;
    received: number;
    remaining: number;
    expenses: number;
    profit: number;
    realized: number;
    distributed: number;
    undistributed: number;
  };
  vat: {
    outputVat: number;
    inputVat: number;
    net: number;
    reserved: number;
    invoices: number;
    source: "invoices" | "receipts";
  };
  warnings: { code: string; text: string; count?: number }[];
};

export const closeCheckQuery = (projectId: string) => ({
  queryKey: ["project-close", projectId],
  queryFn: async () => ok<Check>(await fetch(`/api/projects/${projectId}/close`)),
});

const post = async (url: string, body: unknown) =>
  ok(
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <li className="flex justify-between gap-3">
    <span className="text-muted">{label}</span>
    <span className={strong ? "font-bold" : "font-medium"}>{value}</span>
  </li>
);

/**
 * «إغلاق المشروع»: what is still open (warnings only), the final figures and VAT, then the close
 * itself — which locks the project's money records — and what to do with its profit.
 */
export function CloseProjectDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery(closeCheckQuery(projectId));
  const [step, setStep] = useState<"review" | "done">("review");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [distribute, setDistribute] = useState(false);
  const c = q.data;

  const close = async () => {
    setBusy(true);
    setErr("");
    try {
      await post(`/api/projects/${projectId}/close`, { note });
      for (const k of [
        "projects",
        "finance",
        "company-finance",
        "finance-overview",
        "project-close",
      ])
        qc.invalidateQueries({ queryKey: [k] });
      toast("أُغلق المشروع");
      setStep("done");
    } catch {
      setErr("تعذّر الإغلاق");
    } finally {
      setBusy(false);
    }
  };

  if (distribute) return <DistributionWizard projectPreset={projectId} onClose={onClose} />;

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={step === "done" ? "أُغلق المشروع" : `إغلاق المشروع — ${projectName}`}
      footer={
        step === "review" ? (
          <DialogActions onCancel={onClose}>
            <Button disabled={!c || busy} onClick={close}>
              <Lock className="size-4" /> {busy ? "جارٍ الإغلاق…" : "إغلاق المشروع"}
            </Button>
            <Button variant="secondary" onClick={() => q.refetch()}>
              تحديث المراجعة
            </Button>
          </DialogActions>
        ) : (
          <DialogActions onCancel={onClose} cancelLabel="لاحقاً ضمن توزيع الربع">
            <Button
              disabled={!c || c.figures.undistributed <= 0}
              onClick={() => setDistribute(true)}
            >
              توزيع ربح المشروع الآن
            </Button>
          </DialogActions>
        )
      }
    >
      {err && <Notice>{err}</Notice>}
      {!c ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : step === "done" ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5" /> أُغلق المشروع وقُفلت قيوده ومقبوضاته وفواتيره.
          </p>
          <p>
            ربحه المتحقق <b>{sar(c.figures.realized)}</b>، وُزّع منه {sar(c.figures.distributed)}،
            والمتبقي للتوزيع <b>{sar(c.figures.undistributed)}</b>.
          </p>
          <p className="text-muted">
            يظهر المشروع في «الأرباح والتوزيع» بشارة «مغلق · جاهز للتوزيع». وزّعوا ربحه الآن وحده، أو
            ضمن توزيع الربع لاحقاً.
          </p>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          {c.warnings.length > 0 ? (
            <section
              aria-label="قبل الإغلاق"
              className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <p className="mb-1.5 font-semibold">قبل الإغلاق، راجعوا ({c.warnings.length}):</p>
              <ul className="space-y-1">
                {c.warnings.map((w) => (
                  <li key={w.code} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {w.text}
                      {w.count ? ` (${w.count})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                تنبيهات فقط: يمكنكم الإغلاق الآن، أو إصلاحها ثم «تحديث المراجعة».
              </p>
            </section>
          ) : (
            <Notice tone="blue">لا ملاحظات: المشروع جاهز للإغلاق.</Notice>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label="الأرقام النهائية" className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">الأرقام النهائية</h3>
              <ul className="space-y-1">
                <Row label="قيمة العقد (شامل الضريبة)" value={sar(c.figures.gross)} />
                <Row label="المستلم المعتمد" value={sar(c.figures.received)} />
                <Row label="المتبقي على العميل" value={sar(c.figures.remaining)} />
                <Row label="المصروفات" value={sar(c.figures.expenses)} />
                <Row label="ربح المشروع" value={sar(c.figures.profit)} />
                <Row label="المتحقق منه" value={sar(c.figures.realized)} />
                <Row label="وُزّع سابقاً" value={sar(c.figures.distributed)} />
                <Row label="المتبقي للتوزيع" value={sar(c.figures.undistributed)} strong />
              </ul>
            </section>
            <section aria-label="ضريبة المشروع" className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">ضريبة المشروع</h3>
              <ul className="space-y-1">
                <Row
                  label={
                    c.vat.source === "invoices"
                      ? "ضريبة المبيعات (الفواتير)"
                      : "ضريبة المبيعات (الاستلامات)"
                  }
                  value={sar(c.vat.outputVat)}
                />
                <Row label="ضريبة المشتريات القابلة للخصم" value={sar(c.vat.inputVat)} />
                <Row label="صافي ضريبة المشروع" value={sar(c.vat.net)} strong />
                {c.vat.reserved > 0 && (
                  <Row label="المحجوز لها في البنود" value={sar(c.vat.reserved)} />
                )}
              </ul>
              <p className="mt-2 text-xs text-muted">
                تدخل في إقرار الربع حسب تاريخ كل فاتورة؛ السداد للهيئة يُسجَّل من صفحة الضريبة.
              </p>
            </section>
          </div>
          <Field label="ملاحظة الإغلاق (اختياري)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-xs text-muted">
            بعد الإغلاق لا تُضاف قيود أو مقبوضات أو فواتير للمشروع ولا تُعدَّل، حتى «إعادة الفتح» بسبب
            يُسجَّل في سجل النشاط.
          </p>
        </div>
      )}
    </Dialog>
  );
}

/** Reopening a closed project: the reason goes to the activity log. */
export function ReopenProjectDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="إعادة فتح المشروع"
      footer={
        <DialogActions onCancel={onClose}>
          <Button
            disabled={reason.trim().length < 3}
            onClick={async () => {
              try {
                await post(`/api/projects/${projectId}/close/reopen`, { reason });
                for (const k of ["projects", "finance", "company-finance", "project-close"])
                  qc.invalidateQueries({ queryKey: [k] });
                toast("أُعيد فتح المشروع");
                onClose();
              } catch {
                setErr("تعذّر إعادة الفتح");
              }
            }}
          >
            إعادة الفتح
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      <Field label="سبب إعادة الفتح" hint="يُسجَّل في سجل النشاط">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Dialog>
  );
}
