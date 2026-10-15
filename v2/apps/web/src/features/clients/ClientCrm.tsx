import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  type ActivityType,
  FOLLOW_UP_LABEL,
  followUpState,
  RELATIONSHIP_LABEL,
  SOURCE_LABEL,
  SOURCES,
} from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone, StickyNote, Trash2, Users } from "lucide-react";
import { type ComponentType, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "../../components/ui";
import { ago, day, today } from "../../lib/format";
import { useCan } from "../../session";
import { ActivityTimeline } from "../sales/Timeline";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import { crmQuery } from "./api";

const ICON: Record<ActivityType, ComponentType<{ className?: string }>> = {
  call: Phone,
  meeting: Users,
  visit: Users,
  email: Mail,
  whatsapp: MessageCircle,
  note: StickyNote,
};
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** A client's CRM card: who looks after them, the next follow-up, and the log of contacts. */
export function ClientCrm({ clientId }: { clientId: string }) {
  const can = useCan();
  const edit = can("clients.edit");
  const qc = useQueryClient();
  const q = useQuery(crmQuery(clientId));
  const people = useQuery(assigneesQuery);
  const [type, setType] = useState<ActivityType>("call");
  const [summary, setSummary] = useState("");
  const [on, setOn] = useState(today());
  const [follow, setFollow] = useState<string | undefined>(undefined); // undefined = leave as is
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  if (!q.data) return <Card className="h-40 animate-pulse" aria-busy />;
  const { crm, activities, relationship } = q.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["crm", clientId] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch {
      setError("تعذّر الحفظ، حاول مرة أخرى.");
    }
  };
  const patch = (body: object) => run(() => send("PATCH", `/api/crm/clients/${clientId}`, body));
  const state = followUpState(crm.nextFollowUpAt, today());

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {error && <Notice>{error}</Notice>}
        {edit && (
          <Card>
            <h2 className="mb-3 font-semibold">تسجيل تواصل</h2>
            <div role="radiogroup" aria-label="نوع التواصل" className="mb-3 flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((t) => {
                const Icon = ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => setType(t)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition sm:min-h-9 ${type === t ? "border-brand bg-brand-soft text-brand" : "text-muted hover:bg-brand-soft/50"}`}
                  >
                    <Icon className="size-4" />
                    {ACTIVITY_LABEL[t]}
                  </button>
                );
              })}
            </div>
            <Textarea
              aria-label="ما دار في التواصل"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="ماذا دار؟ وما المتفق عليه؟"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="تاريخ التواصل">
                <Input
                  type="date"
                  value={on}
                  max={today()}
                  onChange={(e) => setOn(e.target.value)}
                />
              </Field>
              <Field
                label="المتابعة التالية"
                hint={
                  follow === undefined ? "بلا تغيير" : follow === "" ? "تُمسح المتابعة" : undefined
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  <Input
                    type="date"
                    value={follow ?? ""}
                    min={today()}
                    onChange={(e) => setFollow(e.target.value)}
                    className="min-w-36 flex-1"
                  />
                  {[
                    ["غداً", 1],
                    ["بعد أسبوع", 7],
                    ["بعد شهر", 30],
                  ].map(([l, n]) => (
                    <Button
                      key={l}
                      variant="secondary"
                      onClick={() => setFollow(addDays(n as number))}
                    >
                      {l}
                    </Button>
                  ))}
                  <Button variant="ghost" onClick={() => setFollow("")}>
                    مسح
                  </Button>
                </div>
              </Field>
            </div>
            <Button
              className="mt-3"
              disabled={!summary.trim()}
              onClick={async () => {
                await run(() =>
                  send("POST", `/api/crm/clients/${clientId}/activities`, {
                    type,
                    summary,
                    on,
                    ...(follow !== undefined ? { followUpAt: follow } : {}),
                  }),
                );
                setSummary("");
                setFollow(undefined);
              }}
            >
              حفظ التواصل
            </Button>
          </Card>
        )}

        <section aria-label="سجل التواصل">
          <h2 className="mb-3 font-semibold">سجل التواصل</h2>
          {activities.length === 0 && (
            <EmptyState
              title="لا تواصل مسجّل بعد"
              text="سجّل أول اتصال أو اجتماع ليظهر هنا بترتيب زمني."
            />
          )}
          <ActivityTimeline
            items={activities}
            linkOpportunities
            onDelete={
              edit ? (id) => run(() => send("DELETE", `/api/crm/activities/${id}`)) : undefined
            }
          />
        </section>
      </div>

      <aside className="space-y-4">
        <Card>
          <h2 className="mb-3 font-semibold">العلاقة</h2>
          <Badge
            tone={
              relationship === "active"
                ? "green"
                : relationship === "prospect"
                  ? "blue"
                  : relationship === "dormant"
                    ? "amber"
                    : "gray"
            }
          >
            {RELATIONSHIP_LABEL[relationship]}
          </Badge>
          <p className="mt-2 text-xs text-muted">
            تُحسب تلقائياً من المشاريع والفرص والعروض وآخر تواصل.
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">آخر تواصل</dt>
              <dd>{crm.lastContactAt ? ago(crm.lastContactAt) : "لم يحدث"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">المتابعة التالية</dt>
              <dd className={state === "overdue" ? "font-semibold text-red-600" : ""}>
                {crm.nextFollowUpAt
                  ? `${day(crm.nextFollowUpAt)}${state === "overdue" || state === "today" ? ` · ${FOLLOW_UP_LABEL[state]}` : ""}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">المسؤول والمصدر</h2>
          <Field label="المسؤول">
            <Select
              disabled={!edit}
              value={crm.ownerId}
              onChange={(e) => patch({ ownerId: e.target.value })}
            >
              <option value="">— غير محدد —</option>
              {people.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المصدر">
            <Select
              disabled={!edit}
              value={crm.source}
              onChange={(e) => patch({ source: e.target.value })}
            >
              <option value="">— غير محدد —</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الوسوم" hint="اضغط Enter لإضافة وسم">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {crm.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!edit}
                    aria-label={`إزالة الوسم ${t}`}
                    onClick={() => patch({ tags: crm.tags.filter((x) => x !== t) })}
                    className="rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand hover:line-through"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              {edit && (
                <Input
                  aria-label="وسم جديد"
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagText.trim()) {
                      e.preventDefault();
                      patch({ tags: [...crm.tags, tagText.trim()] });
                      setTagText("");
                    }
                  }}
                />
              )}
            </div>
          </Field>
        </Card>
      </aside>
    </div>
  );
}
