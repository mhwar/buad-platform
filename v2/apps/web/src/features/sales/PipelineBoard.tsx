import { pipelineStats } from "@buad/domain";
import { useState } from "react";
import { sar } from "../../lib/format";
import { type ProductRequest, REQUEST_LABEL, type RequestStatus } from "../products/products-api";
import { send } from "../team/queries";
import { LeadCard, STAGES } from "./LeadCard";

/**
 * The pipeline as a board: a column per stage with its count, value and weighted value.
 * Cards move by dragging; each card also has a stage menu, so it works from the keyboard and on touch.
 */
export function PipelineBoard({
  reqs,
  ownerName,
  edit,
  onChanged,
  onFollow,
  onQuote,
  onDetails,
}: {
  reqs: ProductRequest[];
  ownerName: (id: string) => string;
  edit: boolean;
  onChanged: () => void;
  onFollow: (r: ProductRequest) => void;
  onQuote: (r: ProductRequest) => void;
  onDetails: (r: ProductRequest) => void;
}) {
  const [over, setOver] = useState<RequestStatus | null>(null);
  const stats = pipelineStats(
    reqs.map((r) => ({
      status: r.status,
      valueHalalas: Math.round(r.value * 100),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  );
  const statOf = (s: string) => stats.stages.find((x) => x.stage === s);
  const drop = async (e: React.DragEvent, to: RequestStatus) => {
    e.preventDefault();
    setOver(null);
    if (!edit) return;
    const id = e.dataTransfer.getData("text/lead");
    const r = reqs.find((x) => x.id === id);
    if (!r || r.status === to) return;
    await send("PATCH", `/api/product-requests/${id}`, { status: to });
    onChanged();
  };
  return (
    <div
      className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3"
      role="list"
      aria-label="مراحل الفرص"
    >
      {STAGES.map((s) => {
        const items = reqs.filter((r) => r.status === s);
        const st = statOf(s);
        const closed = s === "won" || s === "lost";
        const value = closed ? items.reduce((sum, r) => sum + r.value, 0) : (st?.value ?? 0) / 100;
        return (
          <section
            key={s}
            role="listitem"
            aria-label={REQUEST_LABEL[s]}
            onDragOver={(e) => {
              if (edit) {
                e.preventDefault();
                setOver(s);
              }
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => drop(e, s)}
            className={`flex w-[17.5rem] shrink-0 flex-col rounded-2xl border p-2 transition ${over === s ? "border-brand bg-brand-soft/60" : "bg-slate-50 dark:bg-slate-900/40"}`}
          >
            <header className="mb-2 px-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{REQUEST_LABEL[s]}</h3>
                <span className="rounded-full bg-surface px-2 text-xs text-muted">
                  {items.length}
                </span>
              </div>
              <p className="text-[11px] text-muted">
                {sar(value)}
                {!closed && st && st.weighted > 0 && ` · مرجّحة ${sar(st.weighted / 100)}`}
              </p>
            </header>
            <ul className="flex min-h-24 flex-1 flex-col gap-2">
              {items.map((r) => (
                <li key={r.id}>
                  <LeadCard
                    r={r}
                    ownerName={ownerName(r.ownerId)}
                    edit={edit}
                    draggable
                    onChanged={onChanged}
                    onFollow={() => onFollow(r)}
                    onQuote={() => onQuote(r)}
                    onDetails={() => onDetails(r)}
                  />
                </li>
              ))}
              {items.length === 0 && (
                <li className="rounded-xl border border-dashed p-4 text-center text-xs text-muted">
                  لا شيء هنا
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
