import { AGING_BUCKETS, reminderText } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, toast } from "../../components/ui";
import { day, sar, today, whatsapp } from "../../lib/format";
import { useCan } from "../../session";
import { orgSettingsQuery, saveOrgSettings } from "../settings/api";
import { send } from "../team/queries";
import { type OwedItem, receivablesQuery } from "./api";
import { ForecastChart } from "./ForecastChart";
import { ReceiveDialog } from "./ReceiveDialog";

const KEY = "buad.opening-balance";
const read = () => {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
};

/** «التحصيل والتدفق»: who owes what and for how long, and the next 13 weeks of cash. */
export function ReceivablesPage() {
  const can = useCan();
  const edit = can("finance.edit");
  const qc = useQueryClient();
  // One opening balance for everyone (the settings); this device's own figure only for those
  // who cannot see or set the company's money, and as a value to hand over once.
  const shared = can("treasury.view");
  const canShare = can("treasury.edit");
  const settings = useQuery({ ...orgSettingsQuery, enabled: shared });
  const server = settings.data?.cashOpening ?? null;
  const [local, setLocal] = useState(read);
  const [draft, setDraft] = useState<number | null>(null);
  const opening = draft ?? (shared ? (server?.amount ?? 0) : local);
  const q = useQuery(receivablesQuery(opening));
  const [error, setError] = useState("");
  const d = q.data;
  const org = "";
  const setOpen = (v: number) => {
    if (canShare) return setDraft(v);
    setLocal(v);
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      // the figure simply is not remembered
    }
  };
  const share = async (amount: number) => {
    try {
      qc.setQueryData(
        orgSettingsQuery.queryKey,
        await saveOrgSettings({ cashOpening: { amount, date: today() } }),
      );
      setDraft(null);
      toast("حُفظ الرصيد الافتتاحي للجميع");
    } catch {
      setError("تعذّر حفظ الرصيد الافتتاحي");
    }
  };
  const [receiving, setReceiving] = useState<OwedItem | null>(null);
  if (!d) return <Card className="h-40 animate-pulse" aria-busy />;
  const late = (due: string) => due < d.today;
  return (
    <div className="space-y-6">
      {error && <Notice>{error}</Notice>}
      <section aria-label="أعمار الديون" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-semibold">أعمار الديون</h2>
          <p className="text-sm text-muted">
            المستحق على العملاء: <b className="text-ink">{sar(d.aging.total)}</b> · المتأخر:{" "}
            <b className={d.aging.overdue ? "text-red-600" : "text-ink"}>{sar(d.aging.overdue)}</b>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {AGING_BUCKETS.map((b) => {
            const v = d.aging.buckets[b.key];
            return (
              <Card key={b.key} className="p-3">
                <p className="text-xs text-muted">{b.label}</p>
                <p
                  className={`mt-1 text-lg font-bold ${b.key === "d90" && v.amount ? "text-red-600" : ""}`}
                >
                  {sar(v.amount)}
                </p>
                <p className="text-xs text-muted">{v.count} دفعة</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-label="الدفعات المنتظرة" className="space-y-2">
        <h2 className="font-semibold">الدفعات المنتظرة</h2>
        {d.items.length === 0 && (
          <EmptyState
            title="لا دفعات منتظرة"
            text="أضف جدول دفعات من صفحة المشروع لتظهر هنا وتُحسب أعمارها."
          />
        )}
        <ul className="grid gap-2 lg:grid-cols-2">
          {d.items.map((i) => {
            const text = reminderText({
              client: i.client,
              project: i.project,
              label: i.label,
              amountRiyals: sar(i.amount),
              dueDate: day(i.dueDate),
              org,
            });
            const wa = whatsapp(i.phone);
            return (
              <li key={i.id} className="rounded-xl border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {i.label} · {i.project}
                    </p>
                    <p className="text-xs text-muted">{i.client}</p>
                    <p
                      className={`text-xs ${late(i.dueDate) ? "font-semibold text-red-600" : "text-muted"}`}
                    >
                      {late(i.dueDate) ? "متأخرة · " : "تستحق "}
                      {day(i.dueDate)}
                    </p>
                  </div>
                  <Badge tone={late(i.dueDate) ? "red" : "blue"}>{sar(i.amount)}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {edit && (
                    <Button variant="secondary" onClick={() => setReceiving(i)}>
                      <Check className="size-4" />
                      تسجيل مقبوض
                    </Button>
                  )}
                  {wa && (
                    <a
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm text-muted hover:text-ink sm:min-h-9"
                    >
                      <MessageCircle className="size-4" />
                      تذكير واتساب
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="التوقّع النقدي" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">التوقّع النقدي لـ13 أسبوعاً</h2>
            <p className="text-xs text-muted">
              الداخل: الدفعات المجدولة (المتأخرة تُحتسب في الأسبوع الأول). الخارج: مصروفات المشاريع
              المسجّلة وغير المسدّدة ({sar(d.pendingExpenses)}).
            </p>
          </div>
          <Field
            label="الرصيد الحالي (ر.س)"
            hint={
              !canShare
                ? shared
                  ? "يضبطه من يملك تعديل المالية"
                  : "يُحفظ على هذا الجهاز"
                : server
                  ? `محفوظ للجميع · ${day(server.date)}`
                  : "يُحفظ للجميع عند الخروج من الحقل"
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              value={opening || ""}
              placeholder="0"
              readOnly={shared && !canShare}
              onChange={(e) => setOpen(Number(e.target.value) || 0)}
              onBlur={() => {
                if (canShare && draft !== null && draft !== (server?.amount ?? 0)) share(draft);
              }}
              className="w-40"
            />
          </Field>
        </div>
        {canShare && !server && local !== 0 && draft === null && (
          <Notice tone="blue">
            على هذا الجهاز رصيد محفوظ سابقاً ({sar(local)}) لا يراه غيرك.{" "}
            <button type="button" className="font-semibold underline" onClick={() => share(local)}>
              اعتماده رصيداً للجميع
            </button>
          </Notice>
        )}
        {d.shortfallWeek && (
          <Notice tone="amber">
            يتوقع أن ينخفض الرصيد عن الصفر في الأسبوع الذي يبدأ {day(d.shortfallWeek)}.
          </Notice>
        )}
        <ForecastChart weeks={d.weeks} />
      </section>
      {receiving && <ReceiveDialog line={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
