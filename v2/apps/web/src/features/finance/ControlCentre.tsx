import { summarize } from "@buad/domain";
import { CATEGORY_LABELS } from "@buad/schema/finance";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "../../components/ui";
import { ApiError, sar } from "../../lib/format";
import { type Ctrl, type Finance, financeApi, financeKey } from "./api";
import { FEE_ROWS } from "./labels";

type Draft = Omit<Ctrl, "contractValue" | "version" | "updatedAt"> & {
  contractValue: number /* riyals */;
};
const toDraft = (c: Ctrl): Draft => {
  const { version: _v, updatedAt: _u, ...rest } = c;
  return { ...rest, contractValue: c.contractValue / 100 };
};
const DEFAULT_OP = ["salary", "logistics", "materials", "other"];

/**
 * «مركز التحكم»: contract value, VAT and fees. Saves itself shortly after each change (like v1),
 * with the version it started from, so a concurrent edit is never silently overwritten.
 */
export function ControlCentre({
  projectId,
  fin,
  canEdit,
}: {
  projectId: string;
  fin: Finance;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const api = financeApi(projectId);
  const [draft, setDraft] = useState<Draft>(() => toDraft(fin.ctrl));
  const [state, setState] = useState<"idle" | "pending" | "saving" | "saved">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const pending = useRef<Partial<Draft>>({});
  const version = useRef(fin.ctrl.version);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Adopt server state when it changes from elsewhere (e.g. after a refetch) and nothing is pending.
  useEffect(() => {
    if (!Object.keys(pending.current).length) {
      setDraft(toDraft(fin.ctrl));
      version.current = fin.ctrl.version;
    }
  }, [fin.ctrl]);

  const flush = async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setState("saving");
    try {
      const res = await api.saveCtrl({ ...patch, version: version.current });
      version.current = res.ctrl.version;
      qc.setQueryData(financeKey(projectId), res);
      setState(Object.keys(pending.current).length ? "pending" : "saved");
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setNotice(
        code === "stale"
          ? "عدّل مستخدم آخر هذه الإعدادات للتو، فعُرضت أحدث القيم. أعيدوا تعديلكم إن لزم."
          : code === "cv_locked"
            ? "قيمة العقد مثبّتة. ألغوا التثبيت أولاً."
            : "تعذّر الحفظ، تحققوا من الاتصال.",
      );
      pending.current = {};
      await qc.invalidateQueries({ queryKey: financeKey(projectId) });
      setState("idle");
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    pending.current = { ...pending.current, [k]: v };
    setNotice(null);
    setState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Live numbers while typing: the same formula the server uses.
  const live = summarize({
    ctrl: { ...draft, contractValue: Math.round(draft.contractValue * 100) },
    entries: fin.entries,
    budget: fin.budget,
  });
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const ro = !canEdit;
  const opCats = draft.opCats.length ? draft.opCats : DEFAULT_OP;
  const toggleOp = (k: string) =>
    set("opCats", opCats.includes(k) ? opCats.filter((x) => x !== k) : [...opCats, k]);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    qc.setQueryData(
      financeKey(projectId),
      await api.addCategory({ label: newCat.trim(), type: "expense" }),
    );
    setNewCat("");
  };
  const removeCategory = async (id: string) => {
    try {
      qc.setQueryData(financeKey(projectId), await api.deleteCategory(id));
    } catch (x) {
      if (x instanceof ApiError && x.body.error === "in_use")
        setNotice(`لا يمكن حذف التصنيف: مستخدم في ${x.body.count} قيد.`);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">مركز التحكم</h2>
        <span className="text-xs text-muted" aria-live="polite">
          {ro
            ? "للاطلاع فقط"
            : state === "saving"
              ? "جارٍ الحفظ…"
              : state === "pending"
                ? "تعديلات غير محفوظة…"
                : state === "saved"
                  ? "حُفظ ✓"
                  : ""}
        </span>
      </div>
      {notice && <Notice tone="amber">{notice}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم العقد">
          <Input
            dir="ltr"
            value={draft.contractNo}
            disabled={ro}
            onChange={(e) => set("contractNo", e.target.value)}
          />
        </Field>
        <Field label="تاريخ العقد">
          <Input
            type="date"
            value={draft.contractDate}
            disabled={ro}
            onChange={(e) => set("contractDate", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="قيمة العقد (ر.س)" hint={draft.cvLocked ? "مثبّتة" : undefined}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              value={draft.contractValue}
              disabled={ro || draft.cvLocked}
              onChange={(e) => set("contractValue", num(e.target.value))}
            />
          </Field>
          <Button
            variant="secondary"
            className={draft.cvLocked ? "mb-5" : ""}
            disabled={ro}
            aria-pressed={draft.cvLocked}
            aria-label={draft.cvLocked ? "إلغاء تثبيت قيمة العقد" : "تثبيت قيمة العقد"}
            onClick={() => set("cvLocked", !draft.cvLocked)}
          >
            {draft.cvLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="نسبة الضريبة %">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              dir="ltr"
              value={draft.vatPct}
              disabled={ro}
              onChange={(e) => set("vatPct", num(e.target.value))}
            />
          </Field>
          <label className="mb-2.5 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.vatIncluded}
              disabled={ro}
              onChange={(e) => set("vatIncluded", e.target.checked)}
              className="size-4 accent-[var(--color-brand)]"
            />
            شامل الضريبة
          </label>
        </div>
      </div>

      <h3 className="mt-6 mb-3 text-sm font-semibold">بنود الاتفاقية</h3>
      <div className="space-y-3">
        {FEE_ROWS.map(({ key, label }) => {
          const v = `${key}V` as const;
          const t = `${key}Type` as const;
          const b = `${key}Base` as const;
          return (
            <div
              key={key}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr]"
            >
              <Field label={label}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={draft[v]}
                  disabled={ro}
                  onChange={(e) => set(v, num(e.target.value))}
                />
              </Field>
              <Select
                aria-label={`نوع ${label}`}
                value={draft[t]}
                disabled={ro}
                onChange={(e) => set(t, e.target.value as "pct")}
              >
                <option value="pct">%</option>
                <option value="fixed">مبلغ ثابت</option>
              </Select>
              <Select
                aria-label={`أساس ${label}`}
                value={draft[b]}
                disabled={ro || draft[t] === "fixed"}
                onChange={(e) => set(b, e.target.value as "net")}
              >
                <option value="net">من الصافي</option>
                <option value="gross">من الإجمالي</option>
              </Select>
              {key === "mkt" ? (
                <label className="mb-2.5 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.mktInternal}
                    disabled={ro}
                    onChange={(e) => set("mktInternal", e.target.checked)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  داخلي (يُضاف للأرباح)
                </label>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>

      {/* شريط الحساب: how the contract value turns into the amount available for execution (v1 _calcTrailHtml). */}
      <div className="mt-6 rounded-xl bg-brand-soft/60 p-4 text-sm" aria-label="شريط الحساب">
        <Trail label="قيمة العقد الكاملة" value={live.grossTotal} strong />
        {live.execAmt > 0 && <Trail sign="−" label="أتعاب التنفيذ" value={live.execAmt} />}
        {live.mkt > 0 && (
          <Trail
            sign="−"
            label={`التسويق${draft.mktInternal ? " — داخلي" : ""}`}
            value={live.mkt}
          />
        )}
        {live.cb > 0 && <Trail sign="−" label="كاش باك" value={live.cb} />}
        {live.cfAmt > 0 && <Trail sign="−" label="رسوم إضافية" value={live.cfAmt} />}
        <div className="my-2 border-t border-brand/20" />
        <Trail
          sign="="
          label="المتاح للتنفيذ"
          value={live.available}
          strong
          tone={live.available >= 0 ? "good" : "bad"}
        />
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold">تصنيفات المصاريف التشغيلية</h3>
      <p className="mb-2 text-xs text-muted">تُحسب في «المتبقي للتنفيذ».</p>
      <div className="flex flex-wrap gap-2">
        {[...DEFAULT_OP, ...fin.categories.filter((c) => c.type !== "income").map((c) => c.id)].map(
          (k) => {
            const custom = fin.categories.find((c) => c.id === k);
            return (
              <span key={k} className="inline-flex items-center gap-1">
                <label
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${opCats.includes(k) ? "border-brand bg-brand-soft text-brand" : "text-muted"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={opCats.includes(k)}
                    disabled={ro}
                    onChange={() => toggleOp(k)}
                  />
                  {custom?.label ?? CATEGORY_LABELS[k] ?? k}
                </label>
                {custom && canEdit && (
                  <button
                    type="button"
                    aria-label={`حذف التصنيف ${custom.label}`}
                    onClick={() => removeCategory(custom.id)}
                    className="text-muted hover:text-red-600"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            );
          },
        )}
      </div>
      {canEdit && (
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="تصنيف مخصص جديد"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
          />
          <Button variant="secondary" onClick={addCategory} disabled={!newCat.trim()}>
            <Plus className="size-4" /> إضافة
          </Button>
        </div>
      )}
      {fin.categories.some((c) => c.type === "income") && (
        <p className="mt-2 text-xs text-muted">
          تصنيفات دخل:{" "}
          {fin.categories
            .filter((c) => c.type === "income")
            .map((c) => (
              <Badge key={c.id}>{c.label}</Badge>
            ))}
        </p>
      )}
    </Card>
  );
}

function Trail({
  sign,
  label,
  value,
  strong,
  tone,
}: {
  sign?: string;
  label: string;
  value: number;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "bad"
        ? "text-red-600"
        : sign === "−"
          ? "text-red-600"
          : "text-ink";
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? "font-semibold" : ""}`}>
      <span>
        <span className="inline-block w-4 text-muted">{sign}</span>
        {label}
      </span>
      <span className={color} dir="ltr">
        {sar(value)}
      </span>
    </div>
  );
}
