import { daysInStage, isStale } from "@buad/domain";
import { Link } from "@tanstack/react-router";
import { CalendarClock, FileText, MessageCircle } from "lucide-react";
import { Badge, BadgeMenu, Button, Card, Menu, type Tone } from "../../components/ui";
import { ago, day, sar, whatsapp } from "../../lib/format";
import { type ProductRequest, REQUEST_LABEL, type RequestStatus } from "../products/products-api";
import { send } from "../team/queries";

export const STAGES: RequestStatus[] = ["new", "contacted", "quoted", "negotiating", "won", "lost"];
const STAGE_TONE: Record<RequestStatus, Tone> = {
  new: "gray",
  contacted: "blue",
  quoted: "blue",
  negotiating: "amber",
  won: "green",
  lost: "red",
};
const today = () => new Date().toISOString().slice(0, 10);

/** One lead as a card: who, how much, how long since anything happened, and what can be done next. */
export function LeadCard({
  r,
  ownerName,
  edit,
  onChanged,
  onFollow,
  onQuote,
  draggable = false,
}: {
  r: ProductRequest;
  ownerName: string;
  edit: boolean;
  onChanged: () => void;
  onFollow: () => void;
  onQuote: () => void;
  draggable?: boolean;
}) {
  const open = !["won", "lost"].includes(r.status);
  const late = !!r.followUpAt && r.followUpAt < today() && open;
  const stale = isStale(
    { status: r.status, updatedAt: r.updatedAt },
    Math.floor(Date.now() / 1000),
  );
  const wa = whatsapp(r.phone);
  const inStage = daysInStage(r, Math.floor(Date.now() / 1000));
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
          <Link
            to="/sales/$id"
            params={{ id: r.id }}
            draggable={false}
            className="font-semibold hover:text-brand hover:underline"
          >
            {r.entity || r.name}
          </Link>
          <p className="text-xs text-muted">
            {[r.entity && r.name !== r.entity ? r.name : "", r.productName]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex flex-wrap gap-1">
          {stale && <Badge tone="amber">راكدة</Badge>}
          {r.value > 0 && <Badge tone="blue">{sar(r.value)}</Badge>}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>وصل {ago(r.createdAt)}</span>
        {open && inStage > 0 && <span>{inStage} يوم في المرحلة</span>}
        {ownerName && <span>المسؤول: {ownerName}</span>}
        {r.followUpAt && (
          <span
            className={`inline-flex items-center gap-1 ${late ? "font-semibold text-red-600" : ""}`}
          >
            <CalendarClock className="size-3" />
            {late ? "متأخرة · " : "متابعة "}
            {day(r.followUpAt)}
          </span>
        )}
        {r.status === "lost" && r.lostReason && <span>السبب: {r.lostReason}</span>}
      </p>
      {edit && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <BadgeMenu
            name={r.name}
            tone={STAGE_TONE[r.status]}
            label={REQUEST_LABEL[r.status]}
            options={STAGES.map((s) => ({
              value: s,
              label: REQUEST_LABEL[s],
              tone: STAGE_TONE[s],
            }))}
            onSelect={async (v) => {
              await send("PATCH", `/api/product-requests/${r.id}`, { status: v });
              onChanged();
            }}
          />
          <span className="flex items-center gap-1">
            {open && (
              <Button variant="secondary" className="min-h-9 px-3" onClick={onFollow}>
                <CalendarClock className="size-4" /> متابعة
              </Button>
            )}
            <Menu
              label={`إجراءات ${r.entity || r.name}`}
              items={[
                { label: "عرض سعر", icon: <FileText />, onSelect: onQuote },
                ...(wa
                  ? [
                      {
                        label: "واتساب",
                        icon: <MessageCircle />,
                        onSelect: () => window.open(`https://wa.me/${wa}`, "_blank", "noreferrer"),
                      },
                    ]
                  : []),
              ]}
            />
          </span>
        </div>
      )}
    </Card>
  );
}
