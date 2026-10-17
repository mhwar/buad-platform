import { quoteTotals } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Textarea,
} from "../../components/ui";
import { ApiError, sar } from "../../lib/format";
import { send } from "../team/queries";
import { catalogQuery, QUOTE_LABEL, type Quote, vatRateQuery } from "./api";

type Line = { label: string; qty: string; unit: string };
const ERR: Record<string, string> = {
  no_items: "أضف بنداً واحداً على الأقل قبل الإرسال.",
  expired: "انتهت صلاحية العرض. عدّل تاريخ الصلاحية أولاً.",
  accepted_locked: "العرض المقبول نهائي ولا يُعدَّل.",
  version_conflict: "عُدّل العرض من مكان آخر. أعد فتحه.",
  bad_transition: "هذا الانتقال غير متاح.",
};
const msg = (e: unknown) =>
  ERR[(e as ApiError).body?.error as string] ?? "تعذّر الحفظ، حاول مرة أخرى.";
const n = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);

/** A quote: create from a lead (or blank), edit the lines, preview the totals, send, accept, print. */
export function QuoteDialog({
  existing,
  seed,
  onClose,
  onSaved,
}: {
  existing?: Quote;
  seed?: { requestId: string; recipient: string; entity: string; title: string; value: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const rate = useQuery(vatRateQuery).data ?? 15;
  const catalog = useQuery(catalogQuery).data ?? [];
  const [service, setService] = useState({
    productId: existing?.productId ?? "",
    packageId: existing?.packageId ?? "",
  });
  const locked = existing?.status === "accepted";
  const [title, setTitle] = useState(existing?.title ?? seed?.title ?? "");
  const [recipient, setRecipient] = useState(existing?.recipient ?? seed?.recipient ?? "");
  const [entity, setEntity] = useState(existing?.entity ?? seed?.entity ?? "");
  const [lines, setLines] = useState<Line[]>(
    existing
      ? existing.items.map((i) => ({ label: i.label, qty: String(i.qty), unit: String(i.unit) }))
      : [{ label: seed?.title ?? "", qty: "1", unit: seed?.value ? String(seed.value) : "" }],
  );
  const [discount, setDiscount] = useState(String(existing?.discount ?? 0));
  const [vat, setVat] = useState(String(existing?.vatPct ?? rate));
  const [valid, setValid] = useState(existing?.validUntil ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = quoteTotals(
    lines.map((l) => ({ label: l.label, qty: n(l.qty), unitHalalas: Math.round(n(l.unit) * 100) })),
    Math.round(n(discount) * 100),
    n(vat),
  );
  const body = {
    title,
    productId: service.productId,
    packageId: service.packageId,
    recipient,
    entity,
    items: lines
      .filter((l) => l.label.trim())
      .map((l) => ({ label: l.label.trim(), qty: n(l.qty), unit: n(l.unit) })),
    discount: n(discount),
    vatPct: n(vat),
    validUntil: valid,
    terms,
  };
  const run = async (fn: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
      if (close) onClose();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(() =>
      existing
        ? send("PATCH", `/api/quotes/${existing.id}`, { ...body, version: existing.version })
        : send("POST", "/api/quotes", { ...body, requestId: seed?.requestId ?? "" }),
    );
  const move = (to: string) =>
    run(async () => {
      if (existing && !locked)
        await send("PATCH", `/api/quotes/${existing.id}`, { ...body, version: existing.version });
      await send("POST", `/api/quotes/${existing?.id}/status`, { to });
    });
  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `عرض سعر ${existing.number}` : "عرض سعر جديد"}
      wide
      footer={
        !locked && (
          <DialogActions
            onCancel={onClose}
            aside={
              existing?.status === "draft" && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => send("DELETE", `/api/quotes/${existing.id}`))}
                >
                  حذف المسودة
                </Button>
              )
            }
          >
            <Button disabled={busy || !title.trim()} onClick={save}>
              حفظ
            </Button>
            {existing?.status === "draft" && (
              <Button variant="secondary" disabled={busy} onClick={() => move("sent")}>
                حفظ وإرسال
              </Button>
            )}
            {existing?.status === "sent" && (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => move("accepted")}>
                  تم القبول
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => move("rejected")}>
                  رُفض
                </Button>
              </>
            )}
          </DialogActions>
        )
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {existing && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                existing.status === "accepted"
                  ? "green"
                  : existing.status === "rejected"
                    ? "red"
                    : existing.status === "sent"
                      ? "blue"
                      : "gray"
              }
            >
              {QUOTE_LABEL[existing.status]}
            </Badge>
            {existing.expired && <Badge tone="amber">منتهي الصلاحية</Badge>}
            <Link
              to="/print/quotes/$id"
              params={{ id: existing.id }}
              className="ms-auto inline-flex min-h-11 items-center gap-1.5 text-sm text-brand underline"
            >
              <Printer className="size-4" />
              طباعة / PDF
            </Link>
          </div>
        )}
        <Field label="عنوان العرض">
          <Input disabled={locked} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="موجّه إلى">
            <Input
              disabled={locked}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </Field>
          <Field label="الجهة">
            <Input disabled={locked} value={entity} onChange={(e) => setEntity(e.target.value)} />
          </Field>
        </div>

        <fieldset className="space-y-2" disabled={locked}>
          <legend className="mb-1 text-sm font-semibold">البنود</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-end gap-2">
              <Field label={i === 0 ? "البند" : "​"}>
                <Input
                  aria-label={`بند ${i + 1}`}
                  value={l.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? "الكمية" : "​"}>
                <Input
                  aria-label={`كمية ${i + 1}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={l.qty}
                  onChange={(e) => set(i, { qty: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? "السعر" : "​"}>
                <Input
                  aria-label={`سعر ${i + 1}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={l.unit}
                  onChange={(e) => set(i, { unit: e.target.value })}
                />
              </Field>
              <Button
                variant="ghost"
                aria-label={`حذف بند ${i + 1}`}
                onClick={() => setLines(lines.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setLines([...lines, { label: "", qty: "1", unit: "" }])}
            >
              <Plus className="size-4" />
              بند
            </Button>
            {catalog.length > 0 && (
              <select
                aria-label="إضافة من باقة"
                value=""
                onChange={(e) => {
                  const item = catalog.find(
                    (c) => `${c.productId}:${c.packageId}` === e.target.value,
                  );
                  if (!item) return;
                  const line = {
                    label: `${item.productName} — ${item.packageName}`,
                    qty: "1",
                    unit: String(item.price),
                  };
                  setLines(
                    lines.length === 1 && !lines[0]?.label.trim() ? [line] : [...lines, line],
                  );
                  setService({ productId: item.productId, packageId: item.packageId });
                  if (!title.trim()) setTitle(`عرض سعر — ${item.productName}`);
                }}
                className="min-h-11 rounded-lg border bg-surface px-2 text-sm sm:min-h-9"
              >
                <option value="">إضافة من باقة…</option>
                {catalog.map((c) => (
                  <option
                    key={`${c.productId}:${c.packageId}`}
                    value={`${c.productId}:${c.packageId}`}
                  >
                    {c.productName} — {c.packageName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="خصم (ر.س)">
            <Input
              disabled={locked}
              type="number"
              inputMode="decimal"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </Field>
          <Field label="ضريبة القيمة المضافة %">
            <Input
              disabled={locked}
              type="number"
              inputMode="decimal"
              min={0}
              value={vat}
              onChange={(e) => setVat(e.target.value)}
            />
          </Field>
          <Field label="صالح حتى">
            <Input
              disabled={locked}
              type="date"
              value={valid}
              onChange={(e) => setValid(e.target.value)}
            />
          </Field>
        </div>
        <Field label="الشروط والملاحظات">
          <Textarea
            disabled={locked}
            rows={3}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </Field>

        <dl className="space-y-1 rounded-xl bg-brand-soft/60 p-3 text-sm" aria-label="الإجماليات">
          <div className="flex justify-between">
            <dt>المجموع</dt>
            <dd>{sar(t.subtotal / 100)}</dd>
          </div>
          {t.discount > 0 && (
            <div className="flex justify-between">
              <dt>الخصم</dt>
              <dd>− {sar(t.discount / 100)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>الضريبة ({n(vat)}%)</dt>
            <dd>{sar(t.vat / 100)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <dt>الإجمالي</dt>
            <dd>{sar(t.total / 100)}</dd>
          </div>
        </dl>

        {locked && (
          <Notice tone="blue">
            {existing?.projectId ? (
              <>
                العرض مقبول وتحوّل إلى مشروع.{" "}
                <Link to="/projects/$id" params={{ id: existing.projectId }} className="underline">
                  فتح المشروع
                </Link>
              </>
            ) : (
              "العرض مقبول. حوّله إلى مشروع من قائمة العروض."
            )}
          </Notice>
        )}
      </div>
    </Dialog>
  );
}
