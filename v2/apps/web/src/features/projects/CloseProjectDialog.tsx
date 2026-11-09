import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, Lock } from "lucide-react";
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
    unapproved: number;
  };
  instalments: { count: number; amount: number };
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

const INVALIDATE = [
  "projects",
  "project",
  "finance",
  "company-finance",
  "finance-overview",
  "project-close",
  "receivables",
  "attention",
];

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
  external = false,
  onClose,
}: {
  projectId: string;
  projectName: string;
  /** External books are separate: their profit is never distributed by the company. */
  external?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery(closeCheckQuery(projectId));
  const [step, setStep] = useState<"review" | "done">("review");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [distribute, setDistribute] = useState(false);
  const [st, setSt] = useState<SettleState>(SETTLE_START);
  const c = q.data;

  const close = async () => {
    if (!c) return;
    setBusy(true);
    setErr("");
    try {
      await post(`/api/projects/${projectId}/close`, { note, ...settleBody(st, c) });
      for (const k of INVALIDATE) qc.invalidateQueries({ queryKey: [k] });
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
            <Button disabled={!c || busy || !!settleError(st, c)} onClick={close}>
              <Lock className="size-4" /> {busy ? "جارٍ الإغلاق…" : "إغلاق المشروع"}
            </Button>
            <Button variant="secondary" onClick={() => q.refetch()}>
              تحديث المراجعة
            </Button>
          </DialogActions>
        ) : external ? (
          <DialogActions onCancel={onClose} cancelLabel="تم">
            {null}
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
          <p className="flex items-center gap-2 font-semibold text-success-ink">
            <CheckCircle2 className="size-5" /> أُغلق المشروع وقُفلت قيوده ومقبوضاته وفواتيره.
          </p>
          <p>
            ربحه المتحقق <b>{sar(c.figures.realized)}</b>، وُزّع منه {sar(c.figures.distributed)}،
            والمتبقي للتوزيع <b>{sar(c.figures.undistributed)}</b>.
          </p>
          <p className="text-muted">
            {external
              ? "مشروع خارجي: أرقامه داخله فقط، ولا يدخل ربحه في توزيعات الشركة."
              : "يظهر المشروع في «الأرباح والتوزيع» بشارة «مغلق · جاهز للتوزيع». وزّعوا ربحه الآن وحده، أو ضمن توزيع الربع لاحقاً."}
          </p>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          {c.warnings.length > 0 ? (
            <section
              aria-label="قبل الإغلاق"
              className="rounded-lg bg-warning-soft p-3 text-warning-ink"
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
          <Settlement
            c={c}
            value={st}
            onChange={setSt}
            keepLabel="يبقى المتبقي مستحقاً على العميل"
          />
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

/* ── Settling the contract (close and cancel) ───────────────── */
type SettleMode = "keep" | "received" | "custom";
export type SettleState = {
  mode: SettleMode;
  custom: string;
  cancelInstalments: boolean;
};
const SETTLE_START: SettleState = { mode: "keep", custom: "", cancelInstalments: false };

/** What a close or a cancellation sends for the contract: a final value, the instalments. */
function settleBody(st: SettleState, c: Check) {
  const finalValue =
    st.mode === "received"
      ? c.figures.received
      : st.mode === "custom" && st.custom !== ""
        ? Number(st.custom)
        : null;
  return { finalValue, cancelInstalments: st.cancelInstalments };
}
/** A custom value must be a number, and not below what was already received. */
const settleError = (st: SettleState, c: Check) =>
  st.mode === "custom" &&
  (st.custom === "" ||
    Number.isNaN(Number(st.custom)) ||
    Number(st.custom) + 0.5 < c.figures.received)
    ? `القيمة النهائية لا تقل عن المستلم (${sar(c.figures.received)})`
    : "";
const needsSettling = (c: Check) => c.figures.remaining > 0.5 || c.instalments.count > 0;

/**
 * The money left open: what the client still owes and the instalments not received yet. The
 * owner keeps it owed, accepts what was received as the final value (the rest is waived), or
 * agrees another final value; the pending instalments can be set aside at the same time.
 */
function Settlement({
  c,
  value,
  onChange,
  keepLabel,
}: {
  c: Check;
  value: SettleState;
  onChange: (v: SettleState) => void;
  keepLabel: string;
}) {
  if (!needsSettling(c)) return null;
  const set = (patch: Partial<SettleState>) => onChange({ ...value, ...patch });
  const pick = (mode: SettleMode) =>
    // Settling the value sets the instalments aside too, unless the owner unticks it.
    set({ mode, cancelInstalments: mode !== "keep" && c.instalments.count > 0 });
  const options: { key: SettleMode; label: string; hint: string }[] = [
    { key: "keep", label: keepLabel, hint: `قيمة العقد تبقى ${sar(c.figures.gross)}` },
    {
      key: "received",
      label: `اعتماد المستلم ${sar(c.figures.received)} قيمة نهائية للعقد`,
      hint: `يُتنازل عن ${sar(c.figures.remaining)}، ويصير ربح المشروع متحققاً بالكامل.`,
    },
    {
      key: "custom",
      label: "قيمة نهائية متفق عليها",
      hint: "مثلاً بعد خصم أو تسوية مع العميل؛ لا تقل عن المستلم.",
    },
  ];
  const err = settleError(value, c);
  return (
    <section aria-label="تسوية العقد" className="space-y-2 rounded-lg border p-3">
      <h3 className="font-semibold">تسوية العقد</h3>
      {c.figures.remaining > 0.5 && (
        <p className="text-muted">
          استُلم {sar(c.figures.received)} من {sar(c.figures.gross)}، والمتبقي على العميل{" "}
          <b className="text-ink">{sar(c.figures.remaining)}</b>
        </p>
      )}
      {c.figures.unapproved > 0 && (
        <p className="text-warning-ink">
          مقبوضات غير معتمدة بـ{sar(c.figures.unapproved)} لا تدخل في المستلم: اعتمدوها أولاً إن كانت
          دفعات فعلية.
        </p>
      )}
      {c.figures.remaining > 0.5 && (
        <div role="radiogroup" aria-label="المتبقي على العميل" className="space-y-2">
          {options.map((o) => (
            <label
              key={o.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${value.mode === o.key ? "border-brand bg-brand-soft" : ""}`}
            >
              <input
                type="radio"
                name="settle"
                checked={value.mode === o.key}
                onChange={() => pick(o.key)}
                className="mt-1 accent-[var(--color-brand)]"
              />
              <span>
                <span className="block font-medium">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
          {value.mode === "custom" && (
            <Field label="القيمة النهائية شامل الضريبة (ر.س)" error={err || undefined}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={value.custom}
                onChange={(e) => set({ custom: e.target.value })}
              />
            </Field>
          )}
        </div>
      )}
      {c.instalments.count > 0 && (
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={value.cancelInstalments}
            onChange={(e) => set({ cancelInstalments: e.target.checked })}
          />
          <span>
            إلغاء الدفعات المجدولة غير المستلمة ({c.instalments.count} بـ
            {sar(c.instalments.amount)})
            <span className="block text-xs text-muted">
              تخرج من «التحصيل» والتدفق النقدي، وتبقى في سجل النشاط.
            </span>
          </span>
        </label>
      )}
    </section>
  );
}

/**
 * «إلغاء المشروع»: what cancelling means for the money, the settlement of what is left open, and
 * a reason for the activity log. The project can be set back to running later.
 */
export function CancelProjectDialog({
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
  const [reason, setReason] = useState("");
  const [st, setSt] = useState<SettleState>(SETTLE_START);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const c = q.data;
  const invalid = !c || reason.trim().length < 3 || !!settleError(st, c);

  const cancel = async () => {
    if (!c) return;
    setBusy(true);
    setErr("");
    try {
      await post(`/api/projects/${projectId}/close/cancel`, { reason, ...settleBody(st, c) });
      for (const k of INVALIDATE) qc.invalidateQueries({ queryKey: [k] });
      toast("أُلغي المشروع");
      onClose();
    } catch {
      setErr("تعذّر إلغاء المشروع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      dirty={reason.trim().length > 0}
      onOpenChange={(o) => !o && onClose()}
      title={`إلغاء المشروع — ${projectName}`}
      footer={
        <DialogActions onCancel={onClose} cancelLabel="تراجع">
          <Button variant="danger" disabled={invalid || busy} onClick={cancel}>
            <Ban className="size-4" /> {busy ? "جارٍ الإلغاء…" : "إلغاء المشروع"}
          </Button>
        </DialogActions>
      }
    >
      {err && <Notice>{err}</Notice>}
      {!c ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <div className="space-y-4 text-sm">
          <section
            aria-label="ماذا يعني الإلغاء"
            className="rounded-lg bg-warning-soft p-3 text-warning-ink"
          >
            <p className="mb-1.5 font-semibold">عند الإلغاء:</p>
            <ul className="list-disc space-y-1 ps-5">
              <li>
                ما استُلم ({sar(c.figures.received)}) يبقى محسوباً في الأرباح والضريبة، وكذلك
                المصروفات المسجّلة ({sar(c.figures.expenses)}).
              </li>
              <li>لا يُطالَب العميل بأي متبقٍّ، ولا تدخل دفعاته المعلّقة في التحصيل والتدفق النقدي.</li>
              <li>
                يمكن إعادته إلى «جاري التنفيذ» لاحقاً من «تعديل بيانات المشروع»، أو إغلاقه نهائياً.
              </li>
            </ul>
          </section>
          <Settlement c={c} value={st} onChange={setSt} keepLabel="لا تسوية الآن" />
          <Field label="سبب الإلغاء" hint="يُسجَّل في سجل النشاط">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
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
