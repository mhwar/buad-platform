import { isStale } from "@buad/domain";
import { CalendarClock, ExternalLink, FileText, MessageCircle } from "lucide-react";
import { Badge, Button, Card } from "../../components/ui";
import { ago, sar, whatsapp } from "../../lib/format";
import { type ProductRequest, REQUEST_LABEL, type RequestStatus } from "../products/products-api";
import { send } from "../team/queries";

export const STAGES: RequestStatus[] = ["new", "contacted", "quoted", "negotiating", "won", "lost"];
const today = () => new Date().toISOString().slice(0, 10);

/** One lead as a card: who, how much, how long since anything happened, and what can be done next. */
export function LeadCard({
  r,
  ownerName,
  edit,
  onChanged,
  onFollow,
  onQuote,
  onDetails,
  draggable = false,
}: {
  r: ProductRequest;
  ownerName: string;
  edit: boolean;
  onChanged: () => void;
  onFollow: () => void;
  onQuote: () => void;
  onDetails: () => void;
  draggable?: boolean;
}) {
  const open = !["won", "lost"].includes(r.status);
  const late = !!r.followUpAt && r.followUpAt < today() && open;
  const stale = isStale(
    { status: r.status, updatedAt: r.updatedAt },
    Math.floor(Date.now() / 1000),
  );
  const wa = whatsapp(r.phone);
  return (
    <Card
      className="space-y-2 p-3"
      {...(draggable
        ? {
            draggable: edit,
            onDragStart: (e: React.DragEvent) => {
              e.dataTransfer.setData("text/lead", r.id);
              e.dataTransfer.effectAllowed = "move";
            },
          }
        : {})}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-muted">
            {[r.entity, r.productName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="flex flex-wrap gap-1">
          {stale && <Badge tone="amber">راكدة</Badge>}
          {r.value > 0 && <Badge tone="blue">{sar(r.value)}</Badge>}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>وصل {ago(r.createdAt)}</span>
        {ownerName && <span>المسؤول: {ownerName}</span>}
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
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label={`مرحلة ${r.name}`}
            value={r.status}
            onChange={async (e) => {
              await send("PATCH", `/api/product-requests/${r.id}`, { status: e.target.value });
              onChanged();
            }}
            className="min-h-11 rounded-lg border bg-surface px-2 text-sm sm:min-h-9"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {REQUEST_LABEL[s]}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={onFollow}>
            متابعة
          </Button>
          <Button variant="secondary" onClick={onQuote}>
            <FileText className="size-4" />
            عرض
          </Button>
          <Button variant="ghost" aria-label={`تفاصيل وتسعير ${r.name}`} onClick={onDetails}>
            <ExternalLink className="size-4" />
          </Button>
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`واتساب ${r.name}`}
              className="inline-flex min-h-11 items-center rounded-lg border px-2.5 text-muted hover:text-ink sm:min-h-9"
            >
              <MessageCircle className="size-4" />
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
