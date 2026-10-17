import { SCHEDULE_KINDS, SCHEDULE_LABEL, type ScheduleKind } from "@buad/domain";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Dialog, DialogActions, Field, Input, Notice } from "../../components/ui";
import { send } from "../team/queries";
import type { Quote } from "./api";

/** An accepted quote becomes a project: pick how it will be paid and the schedule is created with it. */
export function ConvertQuoteDialog({
  quote,
  onClose,
  onDone,
}: {
  quote: Quote;
  onClose: () => void;
  onDone: () => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleKind>("half");
  const [name, setName] = useState(quote.title);
  const [similar, setSimilar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ projectId: string; instalments: number } | null>(null);

  const go = async (confirmSimilarName = false) => {
    setBusy(true);
    setError("");
    try {
      const r = await send<{ projectId: string; instalments: number }>(
        "POST",
        `/api/quotes/${quote.id}/convert`,
        {
          schedule,
          projectName: name,
          confirmSimilarName,
        },
      );
      setDone(r);
      onDone();
    } catch (e) {
      const body = (e as { body?: { error?: string; similar?: { name: string } } }).body;
      if (body?.error === "similar_name") setSimilar(body.similar?.name ?? "");
      else setError("تعذّر التحويل، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="تحويل إلى مشروع"
      wide
      footer={
        !done && (
          <DialogActions onCancel={onClose}>
            <Button disabled={busy || !name.trim()} onClick={() => go()}>
              تحويل إلى مشروع
            </Button>
          </DialogActions>
        )
      }
    >
      {done ? (
        <div className="space-y-3">
          <Notice tone="blue">
            أُنشئ المشروع{done.instalments ? ` وجدول دفعات من ${done.instalments} دفعة` : ""}. تجد
            الدفعات في المالية ← التحصيل.
          </Notice>
          <Link
            to="/projects/$id"
            params={{ id: done.projectId }}
            className="inline-flex min-h-11 items-center text-brand underline"
          >
            فتح المشروع
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Notice>{error}</Notice>}
          {similar !== null && (
            <Notice tone="amber">
              يوجد عميل باسم مشابه{similar ? ` («${similar}»)` : ""}. هل تريد إنشاء عميل جديد رغم
              ذلك؟
              <Button variant="secondary" className="ms-3" disabled={busy} onClick={() => go(true)}>
                نعم، أنشئ عميلاً جديداً
              </Button>
            </Notice>
          )}
          <p className="text-sm text-muted">
            يُنشأ العميل إن لم يكن موجوداً ومشروع بمسوّدة بقيمة العرض {quote.number}، ويُغلق الطلب
            المرتبط كمكسوب.
          </p>
          <Field label="اسم المشروع">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div role="radiogroup" aria-label="جدول الدفعات" className="space-y-2">
            <p className="text-sm font-semibold">جدول الدفعات</p>
            {SCHEDULE_KINDS.map((k) => (
              <label
                key={k}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${schedule === k ? "border-brand bg-brand-soft text-brand" : ""}`}
              >
                <input
                  type="radio"
                  name="schedule"
                  checked={schedule === k}
                  onChange={() => setSchedule(k)}
                  className="accent-[var(--color-brand)]"
                />
                {SCHEDULE_LABEL[k]}
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
