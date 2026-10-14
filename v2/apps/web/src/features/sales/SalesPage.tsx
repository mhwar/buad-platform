import { weightedPipeline } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, MessageCircle } from "lucide-react";
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
import { ago, sar, whatsapp } from "../../lib/format";
import { useCan } from "../../session";
import {
  type ProductRequest,
  REQUEST_LABEL,
  type RequestStatus,
  requestsQuery,
} from "../products/products-api";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import { QUOTE_LABEL, type Quote, quotesQuery } from "./api";
import { QuoteDialog } from "./QuoteDialog";

const STAGES: RequestStatus[] = ["new", "contacted", "quoted", "negotiating", "won", "lost"];
const today = () => new Date().toISOString().slice(0, 10);

/** «المبيعات»: the pipeline from first enquiry to contract, and the quotes sent along the way. */
export function SalesPage() {
  const [tab, setTab] = useState<"pipeline" | "quotes">("pipeline");
  return (
    <div className="space-y-5">
      <Segmented
        label="المبيعات"
        value={tab}
        onChange={setTab}
        items={[
          { value: "pipeline", label: "المسار" },
          { value: "quotes", label: "عروض الأسعار" },
        ]}
      />
      {tab === "pipeline" ? <Pipeline /> : <Quotes />}
    </div>
  );
}

function Pipeline() {
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const all = useQuery(requestsQuery(""));
  const people = useQuery(assigneesQuery);
  const [stage, setStage] = useState<RequestStatus>("new");
  const [editing, setEditing] = useState<ProductRequest | null>(null);
  const [quoting, setQuoting] = useState<ProductRequest | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const reqs = (all.data?.requests ?? []).filter((r) => !r.interest);
  const open = reqs.filter((r) => !["won", "lost"].includes(r.status));
  const won = reqs.filter((r) => r.status === "won").length;
  const lost = reqs.filter((r) => r.status === "lost").length;
  const forecast = weightedPipeline(
    reqs.map((r) => ({ status: r.status, valueHalalas: Math.round(r.value * 100) })),
  );
  const due = open.filter((r) => r.followUpAt && r.followUpAt < today()).length;
  const items = reqs.filter((r) => r.status === stage);
  const owner = (id: string) => people.data?.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="فرص مفتوحة" value={String(open.length)} />
        <Stat label="القيمة المرجّحة" value={sar(forecast / 100)} hint="القيمة × احتمال المرحلة" />
        <Stat
          label="نسبة التحويل"
          value={won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : "—"}
          hint={`${won} فازت · ${lost} خسرت`}
        />
        <Stat label="متابعات حان موعدها" value={String(due)} tone={due ? "warn" : undefined} />
      </div>

      <Segmented
        label="مراحل المسار"
        value={stage}
        onChange={setStage}
        items={STAGES.map((s) => ({
          value: s,
          label: `${REQUEST_LABEL[s]} (${reqs.filter((r) => r.status === s).length})`,
        }))}
      />

      {all.isSuccess && items.length === 0 && (
        <EmptyState
          title="لا شيء في هذه المرحلة"
          text="الطلبات الواردة من الموقع تبدأ في «جديد»."
        />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {items.map((r) => {
          const late =
            !!r.followUpAt && r.followUpAt < today() && !["won", "lost"].includes(r.status);
          return (
            <li key={r.id}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted">
                      {[r.entity, r.productName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {r.value > 0 && <Badge tone="blue">{sar(r.value)}</Badge>}
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>وصل {ago(r.createdAt)}</span>
                  {owner(r.ownerId) && <span>المسؤول: {owner(r.ownerId)}</span>}
                  {r.followUpAt && (
                    <span
                      className={`inline-flex items-center gap-1 ${late ? "font-semibold text-red-600" : ""}`}
                    >
                      <CalendarClock className="size-3" />
                      {late ? "متأخرة · " : "متابعة "}
                      {r.followUpAt}
                    </span>
                  )}
                  {r.status === "lost" && r.lostReason && <span>السبب: {r.lostReason}</span>}
                </p>
                {edit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`مرحلة ${r.name}`}
                      value={r.status}
                      onChange={async (e) => {
                        await send("PATCH", `/api/product-requests/${r.id}`, {
                          status: e.target.value,
                        });
                        refresh();
                      }}
                      className="min-h-11 rounded-lg border bg-surface px-2 text-sm sm:min-h-9"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {REQUEST_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <Button variant="secondary" onClick={() => setEditing(r)}>
                      تفاصيل المتابعة
                    </Button>
                    <Button variant="secondary" onClick={() => setQuoting(r)}>
                      <FileText className="size-4" />
                      عرض سعر
                    </Button>
                    {whatsapp(r.phone) && (
                      <a
                        href={`https://wa.me/${whatsapp(r.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`واتساب ${r.name}`}
                        className="inline-flex min-h-11 items-center rounded-lg border px-3 text-muted hover:text-ink sm:min-h-9"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {editing && (
        <FollowUpDialog
          r={editing}
          people={people.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {quoting && (
        <QuoteDialog
          seed={{
            requestId: quoting.id,
            recipient: quoting.name,
            entity: quoting.entity,
            title: quoting.productName ? `عرض سعر — ${quoting.productName}` : "عرض سعر",
            value: quoting.value,
          }}
          onClose={() => setQuoting(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["quotes"] });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function FollowUpDialog({
  r,
  people,
  onClose,
  onSaved,
}: {
  r: ProductRequest;
  people: { id: string; name: string; email: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ownerId, setOwnerId] = useState(r.ownerId);
  const [followUpAt, setFollowUp] = useState(r.followUpAt);
  const [value, setValue] = useState(String(r.value || ""));
  const [lostReason, setLost] = useState(r.lostReason);
  const [notes, setNotes] = useState(r.notes);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`متابعة ${r.name}`}>
      <div className="space-y-4">
        <Field label="المسؤول">
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">— غير محدد —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.email}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="موعد المتابعة">
            <Input type="date" value={followUpAt} onChange={(e) => setFollowUp(e.target.value)} />
          </Field>
          <Field label="القيمة المتوقعة (ر.س)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        </div>
        {r.status === "lost" && (
          <Field label="سبب عدم الإتمام">
            <Input value={lostReason} onChange={(e) => setLost(e.target.value)} />
          </Field>
        )}
        <Field label="ملاحظات">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button
          className="w-full"
          onClick={async () => {
            await send("PATCH", `/api/product-requests/${r.id}`, {
              ownerId,
              followUpAt,
              value: Number(value) || 0,
              notes,
              ...(r.status === "lost" ? { lostReason } : {}),
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

function Quotes() {
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const q = useQuery(quotesQuery);
  const [open, setOpen] = useState<{ q?: Quote } | null>(null);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["product-requests"] });
  };
  const TONE = { draft: "gray", sent: "blue", accepted: "green", rejected: "red" } as const;
  return (
    <div className="space-y-4">
      {edit && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen({})}>عرض سعر جديد</Button>
        </div>
      )}
      {q.isSuccess && q.data.length === 0 && (
        <EmptyState
          title="لا عروض أسعار بعد"
          text="أنشئ عرضاً من أي فرصة في المسار أو من هنا، ثم أرسله كملف PDF."
        />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {q.data?.map((z) => (
          <li key={z.id}>
            <button
              type="button"
              onClick={() => setOpen({ q: z })}
              className="block w-full text-start"
            >
              <Card className="space-y-1 p-4 transition hover:border-brand">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{z.number}</p>
                  <span className="flex items-center gap-1">
                    {z.expired && z.status !== "rejected" && <Badge tone="amber">منتهٍ</Badge>}
                    <Badge tone={TONE[z.status]}>{QUOTE_LABEL[z.status]}</Badge>
                  </span>
                </div>
                <p className="text-sm">{z.title}</p>
                <p className="text-xs text-muted">
                  {[z.recipient, z.entity].filter(Boolean).join(" · ")}
                </p>
                <p className="text-base font-bold">{sar(z.totals.total)}</p>
              </Card>
            </button>
          </li>
        ))}
      </ul>
      {open && <QuoteDialog existing={open.q} onClose={() => setOpen(null)} onSaved={done} />}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}
