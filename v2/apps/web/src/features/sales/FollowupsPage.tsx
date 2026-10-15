import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  type ActivityType,
  FOLLOW_UP_LABEL,
  type FollowUpState,
} from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Textarea,
} from "../../components/ui";
import { day, sar, whatsapp } from "../../lib/format";
import { useCan } from "../../session";
import { type FollowUp, followupsQuery } from "../clients/api";
import { send } from "../team/queries";
import { SalesCrumb } from "./SalesCrumb";

const GROUPS: { state: FollowUpState; title: string }[] = [
  { state: "overdue", title: "متأخرة" },
  { state: "today", title: "اليوم" },
  { state: "soon", title: "هذا الأسبوع" },
  { state: "later", title: "لاحقاً" },
];
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** «المتابعات»: everyone who is waiting to hear from us, clients and open enquiries together. */
export function FollowupsPage() {
  const can = useCan();
  const edit = can("clients.edit");
  const qc = useQueryClient();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const q = useQuery(followupsQuery(scope));
  const [logging, setLogging] = useState<FollowUp | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["product-requests"] });
  };
  /** Moves or clears the date, on whichever record it belongs to. */
  const setDate = async (i: FollowUp, date: string) => {
    await (i.kind === "client"
      ? send("PATCH", `/api/crm/clients/${i.id}`, { nextFollowUpAt: date })
      : send("PATCH", `/api/product-requests/${i.id}`, { followUpAt: date }));
    refresh();
  };
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <SalesCrumb title="المتابعات" subtitle="من ينتظر ردّنا: عملاء وفرصاً، المتأخر منها أولاً" />
      <Segmented
        label="النطاق"
        value={scope}
        onChange={setScope}
        items={[
          { value: "mine", label: "متابعاتي" },
          { value: "all", label: "كل الفريق" },
        ]}
      />
      {q.isSuccess && items.length === 0 && (
        <EmptyState
          title="لا متابعات مجدولة"
          text="حين تسجّل تواصلاً مع عميل وتحدد موعد المتابعة التالية تظهر هنا في وقتها."
        />
      )}
      {GROUPS.map((g) => {
        const rows = items.filter((i) => i.state === g.state);
        if (!rows.length) return null;
        return (
          <section key={g.state} aria-label={g.title} className="space-y-2">
            <h2
              className={`text-sm font-semibold ${g.state === "overdue" ? "text-red-600" : "text-muted"}`}
            >
              {g.title} ({rows.length})
            </h2>
            <ul className="grid gap-2 lg:grid-cols-2">
              {rows.map((i) => {
                const wa = whatsapp(i.phone);
                return (
                  <li key={`${i.kind}-${i.id}`}>
                    <Card className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={i.kind === "client" ? "/clients/$id" : "/sales/$id"}
                            params={{ id: i.id }}
                            className="font-semibold hover:text-brand"
                          >
                            {i.title}
                          </Link>
                          {i.subtitle && <p className="text-xs text-muted">{i.subtitle}</p>}
                        </div>
                        <span className="flex items-center gap-1.5">
                          <Badge tone={i.kind === "client" ? "gray" : "blue"}>
                            {i.kind === "client" ? "عميل" : "فرصة"}
                          </Badge>
                          {i.value > 0 && <Badge tone="blue">{sar(i.value)}</Badge>}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {FOLLOW_UP_LABEL[i.state]} · {day(i.date)}
                        {i.ownerName && ` · المسؤول: ${i.ownerName}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {edit && i.kind === "client" && (
                          <Button variant="secondary" onClick={() => setLogging(i)}>
                            <Phone className="size-4" />
                            سجّل تواصلاً
                          </Button>
                        )}
                        {edit && (
                          <>
                            <Button variant="ghost" onClick={() => setDate(i, addDays(1))}>
                              غداً
                            </Button>
                            <Button variant="ghost" onClick={() => setDate(i, addDays(7))}>
                              بعد أسبوع
                            </Button>
                            <Button
                              variant="ghost"
                              aria-label={`تمّت متابعة ${i.title}`}
                              onClick={() => setDate(i, "")}
                            >
                              <Check className="size-4" />
                              تمّت
                            </Button>
                          </>
                        )}
                        {wa && (
                          <a
                            href={`https://wa.me/${wa}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`واتساب ${i.title}`}
                            className="inline-flex min-h-11 items-center rounded-lg border px-3 text-muted hover:text-ink sm:min-h-9"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {logging && (
        <LogDialog
          item={logging}
          onClose={() => setLogging(null)}
          onSaved={() => {
            setLogging(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function LogDialog({
  item,
  onClose,
  onSaved,
}: {
  item: FollowUp;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ActivityType>("call");
  const [summary, setSummary] = useState("");
  const [next, setNext] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`تواصل مع ${item.title}`}>
      <div className="space-y-4">
        <Field label="النوع">
          <Select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ماذا دار؟">
          <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="المتابعة التالية" hint="اتركه فارغاً إن لم تلزم متابعة أخرى">
          <Input
            type="date"
            value={next}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Button
          className="w-full"
          disabled={!summary.trim()}
          onClick={async () => {
            await send("POST", `/api/crm/clients/${item.id}/activities`, {
              type,
              summary,
              followUpAt: next,
            });
            onSaved();
          }}
        >
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
