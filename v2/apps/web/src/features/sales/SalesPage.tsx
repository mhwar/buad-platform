import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import { sar } from "../../lib/format";
import { useCan } from "../../session";
import {
  type ProductRequest,
  productsQuery,
  REQUEST_LABEL,
  type RequestStatus,
  requestsQuery,
} from "../products/products-api";
import { AddDialog, RequestCard } from "../products/RequestsInbox";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import { QUOTE_LABEL, type Quote, quotesQuery } from "./api";
import { LeadCard, STAGES } from "./LeadCard";
import { PipelineBoard } from "./PipelineBoard";
import { QuoteDialog } from "./QuoteDialog";

/** «الفرص»: the pipeline from first enquiry to contract — a board on wide screens, stages on phones. */
export function PipelinePage() {
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const all = useQuery(requestsQuery(""));
  const people = useQuery(assigneesQuery);
  const [stage, setStage] = useState<RequestStatus>("new");
  const [editing, setEditing] = useState<ProductRequest | null>(null);
  const [quoting, setQuoting] = useState<ProductRequest | null>(null);
  const [details, setDetails] = useState<ProductRequest | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
    qc.invalidateQueries({ queryKey: ["sales-overview"] });
  };
  const reqs = (all.data?.requests ?? []).filter((r) => !r.interest);
  const items = reqs.filter((r) => r.status === stage);
  const owner = (id: string) => people.data?.find((p) => p.id === id)?.name ?? "";
  const card = (r: ProductRequest) => (
    <LeadCard
      r={r}
      ownerName={owner(r.ownerId)}
      edit={edit}
      onChanged={refresh}
      onFollow={() => setEditing(r)}
      onQuote={() => setQuoting(r)}
      onDetails={() => setDetails(r)}
    />
  );

  return (
    <div className="space-y-4">
      {all.isSuccess && reqs.length === 0 && (
        <EmptyState
          title="لا فرص بعد"
          text="تصلك هنا طلبات «اطلب عرضاً» من الموقع، ويمكنك تسجيل أي استفسار وصلك بوسيلة أخرى."
          action={edit ? <ManualRequestButton onDone={refresh} /> : undefined}
        />
      )}

      {reqs.length > 0 && (
        <>
          <div className="flex justify-end">{edit && <ManualRequestButton onDone={refresh} />}</div>
          <div className="hidden lg:block">
            <PipelineBoard
              reqs={reqs}
              ownerName={owner}
              edit={edit}
              onChanged={refresh}
              onFollow={setEditing}
              onQuote={setQuoting}
              onDetails={setDetails}
            />
          </div>
          <div className="space-y-3 lg:hidden">
            <Segmented
              label="مراحل المسار"
              value={stage}
              onChange={setStage}
              items={STAGES.map((s) => ({
                value: s,
                label: `${REQUEST_LABEL[s]} (${reqs.filter((r) => r.status === s).length})`,
              }))}
            />
            {items.length === 0 && (
              <EmptyState
                title="لا شيء في هذه المرحلة"
                text="الطلبات الواردة من الموقع تبدأ في «جديد»."
              />
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((r) => (
                <li key={r.id}>{card(r)}</li>
              ))}
            </ul>
          </div>
        </>
      )}

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
      {details && (
        <DetailsDialog r={details} onClose={() => setDetails(null)} onChanged={refresh} />
      )}
    </div>
  );
}

/** «تسجيل طلب يدوياً»: an enquiry that came by phone or WhatsApp. */
function ManualRequestButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const products = useQuery(productsQuery);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        تسجيل طلب يدوياً
      </Button>
      <AddDialog
        open={open}
        onClose={() => setOpen(false)}
        products={products.data ?? []}
        onDone={onDone}
      />
    </>
  );
}

/** Notes, pricing from the service's calculator and conversion to a client and project, for one lead. */
function DetailsDialog({
  r,
  onClose,
  onChanged,
}: {
  r: ProductRequest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const products = useQuery(productsQuery);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`تفاصيل ${r.name}`} wide>
      <RequestCard r={r} products={products.data ?? []} onChanged={onChanged} />
    </Dialog>
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

/** «عروض الأسعار»: the quotes sent along the way. */
export function QuotesPage() {
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
