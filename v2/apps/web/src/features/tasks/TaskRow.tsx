import { Check, Clock, Pencil, Trash2 } from "lucide-react";
import { Badge, BadgeMenu, confirmAction, cx, Menu, type Tone } from "../../components/ui";
import { day } from "../../lib/format";
import { send } from "../team/queries";
import { isOverdue, PRIORITY_LABEL, STATUS_LABEL, type Task, type TaskStatus } from "./queries";

export const STATUS_TONE: Record<TaskStatus, Tone> = {
  todo: "gray",
  doing: "blue",
  blocked: "amber",
  done: "green",
};
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
  tone: STATUS_TONE[s],
}));

/**
 * One task card: tick it done from the card, change its status from its badge, and the rarer
 * actions (edit, log time, delete) wait behind «⋯» — one look for every list of tasks.
 */
export function TaskRow({
  t,
  canEdit,
  showProject,
  compact,
  draggable,
  onEdit,
  onTime,
  onChanged,
}: {
  t: Task;
  canEdit: boolean;
  showProject?: boolean;
  /** On the board: a narrow column, so the details wrap under the title. */
  compact?: boolean;
  /** On the board: the card can be dragged to another status column. */
  draggable?: boolean;
  onEdit: () => void;
  onTime: () => void;
  onChanged: () => void;
}) {
  const late = isOverdue(t);
  const done = t.status === "done";
  const setStatus = async (status: TaskStatus) => {
    await send("PATCH", `/api/tasks/${t.id}`, { status });
    onChanged();
  };
  return (
    <li
      className={cx("rounded-xl border bg-surface p-3", draggable && "cursor-grab")}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task", t.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start gap-3">
        {canEdit && (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={`إنجاز ${t.title}`}
            onClick={() => setStatus(done ? "todo" : "done")}
            className={cx(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition before:absolute before:-inset-2.5 relative",
              done
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-300 hover:border-brand dark:border-slate-600",
            )}
          >
            {done && <Check className="size-3.5" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className={cx("font-medium", done && "text-muted line-through")}>{t.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {t.assigneeName && <span>المسؤول: {t.assigneeName}</span>}
            {showProject && t.projectName && <span>{t.projectName}</span>}
            {t.dueDate && (
              <span className={late ? "font-semibold text-red-600" : ""}>
                {late ? "متأخرة · " : "حتى "}
                {day(t.dueDate)}
              </span>
            )}
            {t.priority === "high" && <Badge tone="red">{PRIORITY_LABEL.high}</Badge>}
          </p>
          {compact && (
            <div className="mt-2">
              <BadgeMenu
                name={t.title}
                tone={STATUS_TONE[t.status]}
                label={STATUS_LABEL[t.status]}
                options={STATUS_OPTIONS}
                onSelect={(v) => setStatus(v as TaskStatus)}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!compact && (
            <BadgeMenu
              name={t.title}
              tone={STATUS_TONE[t.status]}
              label={STATUS_LABEL[t.status]}
              options={STATUS_OPTIONS}
              onSelect={(v) => setStatus(v as TaskStatus)}
              disabled={!canEdit}
            />
          )}
          {canEdit && (
            <Menu
              label={`إجراءات ${t.title}`}
              items={[
                { label: "تعديل", icon: <Pencil />, onSelect: onEdit },
                { label: "تسجيل وقت", icon: <Clock />, onSelect: onTime },
                "separator",
                {
                  label: "حذف المهمة",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: async () => {
                    if (
                      !(await confirmAction({
                        title: `حذف المهمة «${t.title}»؟`,
                        action: "حذف المهمة",
                        danger: true,
                      }))
                    )
                      return;
                    await send("DELETE", `/api/tasks/${t.id}`);
                    onChanged();
                  },
                },
              ]}
            />
          )}
        </div>
      </div>
    </li>
  );
}
