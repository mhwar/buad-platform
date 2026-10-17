import { PLAN_STATUS_LABEL, type PlanStatus } from "@buad/domain";
import { Link2, ListPlus, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, type Tone } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { send } from "../team/queries";
import type { Indicator, Initiative, Objective } from "./queries";

const TONE: Record<PlanStatus, Tone> = {
  no_data: "gray",
  not_started: "gray",
  on_track: "green",
  at_risk: "amber",
  late: "red",
  done: "blue",
};
export const StatusBadge = ({ status }: { status: PlanStatus }) => (
  <Badge tone={TONE[status]}>{PLAN_STATUS_LABEL[status]}</Badge>
);

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const pct = value === null ? 0 : Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-end text-xs tabular-nums text-muted">
        {value === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

const INIT_LABEL: Record<Initiative["status"], string> = {
  todo: "لم تبدأ",
  doing: "قيد التنفيذ",
  blocked: "متعثرة",
  done: "منجزة",
};
export const fmt = (n: number) =>
  new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 1 }).format(n);

export function ObjectiveCard({
  o,
  canEdit,
  ownerName,
  parentTitle,
  onEdit,
  onDelete,
  onAddIndicator,
  onEditIndicator,
  onAddInitiative,
  onEditInitiative,
  onReview,
  onChanged,
  onAddTask,
}: {
  o: Objective;
  canEdit: boolean;
  ownerName: string;
  parentTitle?: string;
  onEdit: () => void;
  onDelete: () => void;
  onAddIndicator: () => void;
  onEditIndicator: (i: Indicator) => void;
  onAddInitiative: () => void;
  onEditInitiative: (i: Initiative) => void;
  onReview: () => void;
  onChanged: () => void;
  /** File a task under one of its initiatives (when the viewer may add tasks). */
  onAddTask?: (i: Initiative) => void;
}) {
  const last = o.reviews[0];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold">{o.title}</h3>
          {o.description && <p className="text-sm text-muted">{o.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            {o.quarter > 0 && <Badge tone="blue">الربع {o.quarter}</Badge>}
            {ownerName && <span>المسؤول: {ownerName}</span>}
            {o.budget > 0 && <span>الميزانية: {sar(o.budget)}</span>}
            {parentTitle && (
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3" />
                يخدم: {parentTitle}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={o.status} />
          {canEdit && (
            <>
              <Button variant="ghost" aria-label="تعديل الهدف" onClick={onEdit}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" aria-label="حذف الهدف" onClick={onDelete}>
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <ProgressBar value={o.progress} label={`تقدّم ${o.title}`} />

      <section aria-label="المؤشرات">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold">مؤشرات الأداء</p>
          {canEdit && (
            <Button variant="ghost" onClick={onAddIndicator}>
              <Plus className="size-4" />
              مؤشر
            </Button>
          )}
        </div>
        {o.indicators.length === 0 && (
          <p className="text-xs text-muted">لا مؤشرات بعد. أضف مؤشراً ليُقاس التقدّم بالأرقام.</p>
        )}
        <ul className="space-y-2">
          {o.indicators.map((i) => (
            <li key={i.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onEditIndicator(i)}
                  className="min-w-0 truncate text-start font-medium hover:underline disabled:no-underline"
                >
                  {i.name}
                </button>
                <span className="shrink-0 tabular-nums text-muted">
                  {i.current === null ? "مخفي" : fmt(i.current)} / {fmt(i.target)} {i.unit}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1">
                  <ProgressBar value={i.attainment} label={`تحقق ${i.name}`} />
                </div>
                {i.source !== "manual" && <Badge tone="blue">من المنصة</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="المبادرات">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold">المبادرات</p>
          {canEdit && (
            <Button variant="ghost" onClick={onAddInitiative}>
              <Plus className="size-4" />
              مبادرة
            </Button>
          )}
        </div>
        {o.initiatives.length === 0 && <p className="text-xs text-muted">لا مبادرات بعد.</p>}
        <ul className="space-y-1.5">
          {o.initiatives.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onEditInitiative(i)}
                className="min-w-0 truncate text-start hover:underline disabled:no-underline"
              >
                {i.title}
              </button>
              <span className="flex items-center gap-2">
                {i.dueDate && <span className="text-xs text-muted">حتى {day(i.dueDate)}</span>}
                {!!i.tasks?.total && (
                  <Badge tone={i.tasks.done === i.tasks.total ? "green" : "gray"}>
                    مهام {i.tasks.done}/{i.tasks.total}
                  </Badge>
                )}
                {onAddTask && (
                  <Button
                    variant="ghost"
                    className="px-2"
                    aria-label={`مهمة لـ ${i.title}`}
                    title="أضف مهمة لهذه المبادرة"
                    onClick={() => onAddTask(i)}
                  >
                    <ListPlus className="size-4" />
                  </Button>
                )}
                {canEdit ? (
                  <select
                    aria-label={`حالة ${i.title}`}
                    value={i.status}
                    onChange={async (e) => {
                      await send("PATCH", `/api/plans/initiatives/${i.id}`, {
                        status: e.target.value,
                      });
                      onChanged();
                    }}
                    className="min-h-11 rounded-lg border bg-surface px-2 text-sm sm:min-h-8"
                  >
                    {(Object.keys(INIT_LABEL) as Initiative["status"][]).map((s) => (
                      <option key={s} value={s}>
                        {INIT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge>{INIT_LABEL[i.status]}</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(last || canEdit) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <p className="min-w-0 text-muted">
            {last
              ? `آخر مراجعة${last.quarter ? ` (الربع ${last.quarter})` : ""}: ${last.note || "بلا ملاحظات"}`
              : "لم تُراجع بعد."}
          </p>
          {canEdit && (
            <Button variant="secondary" onClick={onReview}>
              <MessageSquarePlus className="size-4" />
              مراجعة
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
