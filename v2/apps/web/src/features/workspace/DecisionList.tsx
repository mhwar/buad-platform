import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Check, ListChecks, Pencil, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, confirmAction, cx, Menu, Notice } from "../../components/ui";
import { day, today } from "../../lib/format";
import { useCan } from "../../session";
import { send } from "../team/queries";
import { DECISION_LABEL, type Decision } from "./api";
import { DecisionDialog } from "./DecisionDialog";

/** Decisions as rows: who, by when, from which meeting — and the actions to close or delegate them. */
export function DecisionList({
  items,
  showMeeting = true,
  compact = false,
}: {
  items: Decision[];
  showMeeting?: boolean;
  compact?: boolean;
}) {
  const can = useCan();
  const edit = can("meetings.edit");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Decision | null>(null);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch {
      setError("تعذّر تنفيذ العملية");
    }
    qc.invalidateQueries({ queryKey: ["decisions"] });
    qc.invalidateQueries({ queryKey: ["meetings"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const t = today();
  return (
    <>
      {error && <Notice>{error}</Notice>}
      <ul className="divide-y rounded-xl border bg-surface">
        {items.map((d) => {
          const late = d.status === "open" && !!d.dueDate && d.dueDate < t;
          return (
            <li key={d.id} className="flex flex-wrap items-start gap-3 p-3">
              {edit && d.canClose !== false && d.status === "open" ? (
                <button
                  type="button"
                  aria-label={`تم تنفيذ ${d.title}`}
                  onClick={() =>
                    run(() => send("PATCH", `/api/decisions/${d.id}`, { status: "done" }))
                  }
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 text-transparent transition hover:border-emerald-500 hover:text-emerald-500"
                >
                  <Check className="size-3.5" />
                </button>
              ) : (
                <span
                  className={cx(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                    d.status === "done" ? "bg-emerald-500 text-white" : "border-2",
                  )}
                >
                  {d.status === "done" && <Check className="size-3.5" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cx("font-medium", d.status !== "open" && "text-muted line-through")}>
                  {d.title}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                  {d.ownerName && <span>المسؤول: {d.ownerName}</span>}
                  {d.dueDate && (
                    <span
                      className={cx(
                        "inline-flex items-center gap-1",
                        late && "font-semibold text-red-600",
                      )}
                    >
                      <CalendarClock className="size-3" />
                      {late ? "متأخر · " : ""}
                      {day(d.dueDate)}
                    </span>
                  )}
                  {showMeeting && d.meetingTitle && (
                    <Link
                      to="/meetings"
                      search={{ open: d.meetingId }}
                      className="inline-flex items-center gap-1 hover:text-brand"
                    >
                      <Users className="size-3" />
                      {d.meetingTitle}
                    </Link>
                  )}
                  {d.taskId && (
                    <Link
                      to="/tasks"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <ListChecks className="size-3" /> صار مهمة
                    </Link>
                  )}
                </p>
                {!compact && d.details && (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{d.details}</p>
                )}
              </div>
              {d.status !== "open" && (
                <Badge tone={d.status === "done" ? "green" : "gray"}>
                  {DECISION_LABEL[d.status]}
                </Badge>
              )}
              {edit && !compact && (
                <span className="flex gap-1">
                  {d.status === "open" &&
                    !d.taskId &&
                    can("tasks.edit") &&
                    d.canClose !== false && (
                      <Button
                        variant="secondary"
                        className="px-2.5 text-xs"
                        onClick={() => run(() => send("POST", `/api/decisions/${d.id}/task`))}
                      >
                        <ListChecks className="size-3.5" />
                        تحويل إلى مهمة
                      </Button>
                    )}
                  {d.canEdit !== false && (
                    <Menu
                      label={`إجراءات ${d.title}`}
                      items={[
                        { label: "تعديل", icon: <Pencil />, onSelect: () => setEditing(d) },
                        {
                          label: "حذف القرار",
                          icon: <Trash2 />,
                          danger: true,
                          onSelect: async () => {
                            if (
                              await confirmAction({
                                title: `حذف القرار «${d.title}»؟`,
                                action: "حذف القرار",
                                danger: true,
                              })
                            )
                              run(() => send("DELETE", `/api/decisions/${d.id}`));
                          },
                        },
                      ]}
                    />
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {editing && <DecisionDialog existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
