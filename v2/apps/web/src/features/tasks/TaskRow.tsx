import { Clock, Pencil, Trash2 } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { send } from "../team/queries";
import { isOverdue, PRIORITY_LABEL, STATUS_LABEL, type Task, type TaskStatus } from "./queries";

/** One task: status switch on the row itself, plus edit, log time and delete. */
export function TaskRow({
  t,
  canEdit,
  showProject,
  onEdit,
  onTime,
  onChanged,
}: {
  t: Task;
  canEdit: boolean;
  showProject?: boolean;
  onEdit: () => void;
  onTime: () => void;
  onChanged: () => void;
}) {
  const late = isOverdue(t);
  return (
    <li className="rounded-xl border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`font-medium ${t.status === "done" ? "text-muted line-through" : ""}`}>
            {t.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {t.assigneeName && <span>المسؤول: {t.assigneeName}</span>}
            {showProject && t.projectName && <span>{t.projectName}</span>}
            {t.dueDate && (
              <span className={late ? "font-semibold text-red-600" : ""}>
                {late ? "متأخرة · " : "حتى "}
                {t.dueDate}
              </span>
            )}
            {t.priority === "high" && <Badge tone="red">{PRIORITY_LABEL.high}</Badge>}
          </p>
        </div>
        {canEdit ? (
          <select
            aria-label={`حالة ${t.title}`}
            value={t.status}
            onChange={async (e) => {
              await send("PATCH", `/api/tasks/${t.id}`, { status: e.target.value });
              onChanged();
            }}
            className="min-h-11 rounded-lg border bg-surface px-2 text-sm sm:min-h-8"
          >
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        ) : (
          <Badge>{STATUS_LABEL[t.status]}</Badge>
        )}
      </div>
      {canEdit && (
        <div className="mt-2 flex gap-1">
          <Button variant="ghost" aria-label={`تعديل ${t.title}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" aria-label={`تسجيل وقت ${t.title}`} onClick={onTime}>
            <Clock className="size-4" />
          </Button>
          <Button
            variant="ghost"
            aria-label={`حذف ${t.title}`}
            onClick={async () => {
              if (!confirm(`حذف المهمة «${t.title}»؟`)) return;
              await send("DELETE", `/api/tasks/${t.id}`);
              onChanged();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
