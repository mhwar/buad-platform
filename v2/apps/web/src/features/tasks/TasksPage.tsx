import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Segmented } from "../../components/ui";
import { useCan } from "../../session";
import { type Task, tasksQuery } from "./queries";
import { TaskDialog, TimeDialog } from "./TaskDialogs";
import { TaskRow } from "./TaskRow";

/** «المهام»: mine or the whole team's, across projects and company work. */
export function TasksPage() {
  const can = useCan();
  const edit = can("tasks.edit");
  const qc = useQueryClient();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [view, setView] = useState<"open" | "late" | "done">("open");
  const q = useQuery(tasksQuery({ mine: scope === "mine" }));
  const [dialog, setDialog] = useState<{ t?: Task } | null>(null);
  const [timing, setTiming] = useState<Task | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["execution"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const today = new Date().toISOString().slice(0, 10);
  const items = (q.data ?? []).filter((t) =>
    view === "done"
      ? t.status === "done"
      : view === "late"
        ? t.status !== "done" && !!t.dueDate && t.dueDate < today
        : t.status !== "done",
  );
  const counts = {
    open: (q.data ?? []).filter((t) => t.status !== "done").length,
    late: (q.data ?? []).filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today)
      .length,
    done: (q.data ?? []).filter((t) => t.status === "done").length,
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="النطاق"
            value={scope}
            onChange={setScope}
            items={[
              { value: "mine", label: "مهامي" },
              { value: "all", label: "كل الفريق" },
            ]}
          />
          <Segmented
            label="العرض"
            value={view}
            onChange={setView}
            items={[
              { value: "open", label: `مفتوحة (${counts.open})` },
              { value: "late", label: `متأخرة (${counts.late})` },
              { value: "done", label: `منجزة (${counts.done})` },
            ]}
          />
        </div>
        {edit && (
          <Button onClick={() => setDialog({})}>
            <Plus className="size-4" />
            مهمة جديدة
          </Button>
        )}
      </div>
      {q.isSuccess && items.length === 0 && (
        <EmptyState
          title={
            view === "late"
              ? "لا مهام متأخرة"
              : view === "done"
                ? "لا مهام منجزة بعد"
                : "لا مهام مفتوحة"
          }
          text={
            scope === "mine" ? "المهام المسندة إليك تظهر هنا." : "أضف مهمة وأسندها لأحد الفريق."
          }
        />
      )}
      <ul className="grid gap-2 lg:grid-cols-2">
        {items.map((t) => (
          <TaskRow
            key={t.id}
            t={t}
            canEdit={edit}
            showProject
            onEdit={() => setDialog({ t })}
            onTime={() => setTiming(t)}
            onChanged={refresh}
          />
        ))}
      </ul>
      {dialog && (
        <TaskDialog
          existing={dialog.t}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {timing && (
        <TimeDialog
          task={timing}
          onClose={() => setTiming(null)}
          onSaved={() => {
            setTiming(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
