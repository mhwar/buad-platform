import { quoteStats } from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, FolderPlus, Plus, Printer } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Pills,
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
import { ConvertQuoteDialog } from "./ConvertQuoteDialog";
import { LeadCard, STAGES } from "./LeadCard";
import { PipelineBoard } from "./PipelineBoard";
import { QuoteDialog } from "./QuoteDialog";
import { SalesCrumb } from "./SalesCrumb";

export function FollowUpDialog({
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

/** «عروض الأسعار»: how the offers are doing, and the tools to revise, convert and follow them. */
export function QuotesPage() {
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const q = useQuery(quotesQuery);
  const [open, setOpen] = useState<{ q?: Quote } | null>(null);
  const [converting, setConverting] = useState<Quote | null>(null);
  const [filter, setFilter] = useState<
    "" | "draft" | "sent" | "accepted" | "rejected" | "ending" | "waiting"
  >("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["sales-overview"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const TONE = { draft: "gray", sent: "blue", accepted: "green", rejected: "red" } as const;
  const all = q.data ?? [];
  const nowS = Math.floor(Date.now() / 1000);
  const t = new Date().toISOString().slice(0, 10);
  const stats = quoteStats(
    all.map((z) => ({
      id: z.id,
      status: z.status,
      total: Math.round(z.totals.total * 100),
      validUntil: z.validUntil,
      updatedAt: z.updatedAt,
    })),
    t,
    nowS,
  );
  const ending = new Set(stats.expiring.map((x) => x.id));
  const waiting = new Set(stats.waiting.map((x) => x.id));
  const shown = all.filter((z) =>
    filter === ""
      ? true
      : filter === "ending"
        ? ending.has(z.id)
        : filter === "waiting"
          ? waiting.has(z.id)
          : z.status === filter,
  );
  const duplicate = async (z: Quote) => {
    const r = await send<{ id: string }>("POST", `/api/quotes/${z.id}/duplicate`);
    done();
    const fresh = await qc.fetchQuery({ ...quotesQuery, staleTime: 0 });
    setOpen({ q: fresh.find((x) => x.id === r.id) });
  };
  const count = (s: string) => all.filter((z) => z.status === s).length;

  return (
    <div className="space-y-4">
      <SalesCrumb
        title="عروض الأسعار"
        subtitle="كل العروض بحالاتها، ونسخها وتحويل المقبول إلى مشروع"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="أُرسلت"
          value={String(stats.sent)}
          hint={`${stats.accepted} مقبول · ${stats.rejected} مرفوض`}
        />
        <Stat
          label="نسبة القبول"
          value={stats.acceptRate === null ? "—" : `${stats.acceptRate}%`}
          hint="من العروض التي حُسمت"
        />
        <Stat label="متوسط قيمة العرض" value={stats.avgValue ? sar(stats.avgValue / 100) : "—"} />
        <Stat label="قيمة المقبول" value={sar(stats.acceptedValue / 100)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills<typeof filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: "", label: "الكل", count: all.length },
            { value: "draft", label: "مسودة", count: count("draft") },
            { value: "sent", label: "أُرسل", count: count("sent") },
            { value: "accepted", label: "مقبول", count: count("accepted") },
            { value: "rejected", label: "مرفوض", count: count("rejected") },
            { value: "ending", label: "تنتهي قريباً", count: ending.size },
            { value: "waiting", label: "تنتظر رداً", count: waiting.size },
          ]}
        />
        {edit && <Button onClick={() => setOpen({})}>عرض سعر جديد</Button>}
      </div>

      {q.isSuccess && shown.length === 0 && (
        <EmptyState
          title={all.length ? "لا عروض في هذا العرض" : "لا عروض أسعار بعد"}
          text={all.length ? undefined : "أنشئ عرضاً من أي فرصة أو من هنا، ثم أرسله كملف PDF."}
        />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {shown.map((z) => (
          <li key={z.id}>
            <Card className="space-y-2 p-4">
              <button
                type="button"
                onClick={() => setOpen({ q: z })}
                className="block w-full space-y-1 text-start"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{z.number}</span>
                  <span className="flex items-center gap-1">
                    {ending.has(z.id) && <Badge tone="amber">تنتهي قريباً</Badge>}
                    {waiting.has(z.id) && <Badge tone="amber">بلا رد</Badge>}
                    {z.expired && z.status !== "rejected" && z.status !== "accepted" && (
                      <Badge tone="red">منتهٍ</Badge>
                    )}
                    <Badge tone={TONE[z.status]}>{QUOTE_LABEL[z.status]}</Badge>
                  </span>
                </span>
                <span className="block text-sm">{z.title}</span>
                <span className="block text-xs text-muted">
                  {[z.recipient, z.entity].filter(Boolean).join(" · ")}
                </span>
                <span className="block text-base font-bold">{sar(z.totals.total)}</span>
              </button>
              <div className="flex flex-wrap gap-2 border-t pt-2">
                {edit && (
                  <Button
                    variant="ghost"
                    aria-label={`نسخ ${z.number}`}
                    onClick={() => duplicate(z)}
                  >
                    <Copy className="size-4" />
                    نسخ
                  </Button>
                )}
                {edit && z.status === "accepted" && !z.projectId && (
                  <Button variant="secondary" onClick={() => setConverting(z)}>
                    <FolderPlus className="size-4" />
                    تحويل إلى مشروع
                  </Button>
                )}
                {z.projectId && (
                  <Link
                    to="/projects/$id"
                    params={{ id: z.projectId }}
                    className="inline-flex min-h-11 items-center text-sm text-brand underline sm:min-h-9"
                  >
                    فتح المشروع
                  </Link>
                )}
                <Link
                  to="/print/quotes/$id"
                  params={{ id: z.id }}
                  className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink sm:min-h-9"
                >
                  <Printer className="size-4" />
                  طباعة
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {open && <QuoteDialog existing={open.q} onClose={() => setOpen(null)} onSaved={done} />}
      {converting && (
        <ConvertQuoteDialog quote={converting} onClose={() => setConverting(null)} onDone={done} />
      )}
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
