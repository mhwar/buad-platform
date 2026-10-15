import { ACTIVITY_LABEL, type ActivityType } from "@buad/domain";
import { Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Milestone, Phone, StickyNote, Trash2, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Button, cx } from "../../components/ui";
import { ago, day } from "../../lib/format";

export type TimelineItem = {
  id: string;
  type: ActivityType | "stage";
  summary: string;
  at: number;
  createdByName: string;
  requestId: string;
};
const ICON: Record<TimelineItem["type"], ComponentType<{ className?: string }>> = {
  call: Phone,
  meeting: Users,
  visit: Users,
  email: Mail,
  whatsapp: MessageCircle,
  note: StickyNote,
  stage: Milestone,
};
export const activityLabel = (t: TimelineItem["type"]) =>
  t === "stage" ? "تغيّر المرحلة" : ACTIVITY_LABEL[t];

/**
 * A log of contacts, newest first. Moves along the funnel are written by the platform: they read
 * quieter and cannot be deleted. In a client's log, entries about an opportunity link to it.
 */
export function ActivityTimeline({
  items,
  onDelete,
  linkOpportunities = false,
}: {
  items: TimelineItem[];
  onDelete?: (id: string) => void;
  linkOpportunities?: boolean;
}) {
  return (
    <ol className="relative space-y-2 before:absolute before:inset-y-3 before:start-[1.15rem] before:w-px before:bg-slate-200 dark:before:bg-slate-800">
      {items.map((a) => {
        const Icon = ICON[a.type] ?? StickyNote;
        const stage = a.type === "stage";
        return (
          <li
            key={a.id}
            className={cx(
              "relative flex items-start gap-3 rounded-xl p-3",
              stage ? "py-1.5" : "border bg-surface",
            )}
          >
            <span
              className={cx(
                "relative z-10 mt-0.5 rounded-full p-2",
                stage ? "bg-slate-100 text-muted dark:bg-slate-800" : "bg-brand-soft text-brand",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <b className={stage ? "font-medium text-muted" : ""}>{activityLabel(a.type)}</b> ·{" "}
                <span className="text-muted">
                  {day(new Date(a.at * 1000).toISOString().slice(0, 10))} ({ago(a.at)})
                </span>
              </p>
              <p className={cx("whitespace-pre-wrap text-sm", stage && "text-muted")}>
                {a.summary}
              </p>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                {a.createdByName && <span>{a.createdByName}</span>}
                {linkOpportunities && a.requestId && (
                  <Link
                    to="/sales/$id"
                    params={{ id: a.requestId }}
                    className="text-brand hover:underline"
                  >
                    فتح الفرصة
                  </Link>
                )}
              </p>
            </div>
            {onDelete && !stage && (
              <Button variant="ghost" aria-label="حذف التواصل" onClick={() => onDelete(a.id)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
