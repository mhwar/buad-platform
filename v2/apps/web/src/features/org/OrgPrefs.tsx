import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Field, Input, Notice, Textarea, toast } from "../../components/ui";
import { ApiError } from "../../lib/format";
import { type NumberingRow, type OrgPrefs, orgPrefsQuery, saveOrgPrefs } from "../settings/api";

/** «الترقيم»: each kind's prefix and next number. The number may only move forward. */
export function NumberingCard({ canEdit }: { canEdit: boolean }) {
  const q = useQuery(orgPrefsQuery);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, { prefix?: string; next?: string }>>({});
  const [error, setError] = useState("");
  if (!q.data) return null;
  const value = (r: NumberingRow) => ({
    prefix: draft[r.kind]?.prefix ?? r.prefix,
    next: draft[r.kind]?.next ?? String(r.next),
  });
  const changes = Object.fromEntries(
    q.data.numbering.flatMap((r) => {
      const v = value(r);
      const c: { prefix?: string; next?: number } = {};
      if (v.prefix.trim() !== r.prefix) c.prefix = v.prefix.trim();
      if (Number(v.next) !== r.next) c.next = Number(v.next);
      return Object.keys(c).length ? [[r.kind, c]] : [];
    }),
  );
  const save = async () => {
    setError("");
    try {
      qc.setQueryData(orgPrefsQuery.queryKey, await saveOrgPrefs({ numbering: changes }));
      setDraft({});
      toast("حُفظ الترقيم");
    } catch (x) {
      const b = x instanceof ApiError ? x.body : {};
      setError(
        b.error === "counter_down"
          ? `لا يمكن إرجاع الرقم التالي إلى الخلف (أقل قيمة مسموحة ${b.next})، حتى لا يتكرر رقم مستخدم.`
          : "تعذّر الحفظ. البادئة حروف أو أرقام فقط (حتى 8)، بلا شرطة.",
      );
    }
  };
  return (
    <Card role="region" aria-label="الترقيم" className="space-y-4">
      <div>
        <h2 className="font-semibold">الترقيم</h2>
        <p className="text-xs text-muted">
          بادئة كل نوع والرقم الذي يأخذه السجل التالي. يمكن رفع الرقم لمواصلة تسلسل سابق، ولا يمكن
          إنزاله.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <ul className="divide-y">
        {q.data.numbering.map((r) => {
          const v = value(r);
          return (
            <li
              key={r.kind}
              className="grid grid-cols-2 items-end gap-3 py-3 sm:grid-cols-[8rem_1fr_1fr]"
            >
              <div className="col-span-2 sm:col-span-1">
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-muted" dir="ltr">
                  {r.example}
                </p>
              </div>
              <Field label="البادئة">
                <Input
                  value={v.prefix}
                  disabled={!canEdit}
                  maxLength={8}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [r.kind]: { ...d[r.kind], prefix: e.target.value } }))
                  }
                />
              </Field>
              <Field label="الرقم التالي">
                <Input
                  type="number"
                  min={r.next}
                  dir="ltr"
                  value={v.next}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [r.kind]: { ...d[r.kind], next: e.target.value } }))
                  }
                />
              </Field>
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <Button variant="secondary" disabled={!Object.keys(changes).length} onClick={save}>
          حفظ الترقيم
        </Button>
      )}
    </Card>
  );
}

/** Fixed texts new quotes and letters start from; each document can still be edited. */
export function DocTextsCard({ canEdit }: { canEdit: boolean }) {
  const q = useQuery(orgPrefsQuery);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<OrgPrefs["texts"]>>({});
  const [error, setError] = useState("");
  if (!q.data) return null;
  const t = { ...q.data.texts, ...draft };
  const changed = Object.keys(draft).some(
    (k) => draft[k as keyof typeof draft] !== q.data.texts[k as keyof OrgPrefs["texts"]],
  );
  return (
    <Card role="region" aria-label="النصوص الافتراضية" className="space-y-4">
      <div>
        <h2 className="font-semibold">النصوص الافتراضية</h2>
        <p className="text-xs text-muted">
          يبدأ بها كل عرض سعر وخطاب جديد، ثم تُعدَّل فيه عند الحاجة. فارغة = صياغة المنصة.
        </p>
      </div>
      {error && <Notice>{error}</Notice>}
      <Field label="شروط عرض السعر">
        <Textarea
          rows={4}
          value={t.quoteTerms}
          disabled={!canEdit}
          placeholder="مثال: الأسعار شاملة الضريبة. الدفع 50% عند التعميد و50% عند التسليم."
          onChange={(e) => setDraft((d) => ({ ...d, quoteTerms: e.target.value }))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="صلاحية العرض (أيام)" hint="0 = بلا تاريخ صلاحية">
          <Input
            type="number"
            min={0}
            max={365}
            dir="ltr"
            value={t.quoteValidityDays}
            disabled={!canEdit}
            onChange={(e) =>
              setDraft((d) => ({ ...d, quoteValidityDays: Number(e.target.value) || 0 }))
            }
          />
        </Field>
        <Field label="خاتمة الخطاب">
          <Input
            value={t.letterClosing}
            disabled={!canEdit}
            placeholder="وتفضلوا بقبول وافر التحية والتقدير،"
            onChange={(e) => setDraft((d) => ({ ...d, letterClosing: e.target.value }))}
          />
        </Field>
      </div>
      {canEdit && (
        <Button
          variant="secondary"
          disabled={!changed}
          onClick={async () => {
            setError("");
            try {
              qc.setQueryData(orgPrefsQuery.queryKey, await saveOrgPrefs({ texts: draft }));
              setDraft({});
              toast("حُفظت النصوص الافتراضية");
            } catch {
              setError("تعذّر الحفظ");
            }
          }}
        >
          حفظ النصوص
        </Button>
      )}
    </Card>
  );
}
