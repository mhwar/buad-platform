import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Notice } from "../../components/ui";
import { useCan } from "../../session";
import { send } from "../team/queries";
import { executionQuery, hours, type Stage, type Task } from "./queries";
import { TaskDialog, TimeDialog } from "./TaskDialogs";
import { TaskRow } from "./TaskRow";

const NEXT: Record<Stage["status"], Stage["status"]> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};
const LABEL: Record<Stage["status"], string> = {
  todo: "لم تبدأ",
  doing: "قيد التنفيذ",
  done: "منجزة",
};

/** A project's delivery: stages (optionally from the linked service), tasks and hours. */
export function ExecutionTab({ projectId }: { projectId: string }) {
  const can = useCan();
  const edit = can("tasks.edit");
  const qc = useQueryClient();
  const q = useQuery(executionQuery(projectId));
  const [stageTitle, setStageTitle] = useState("");
  const [dialog, setDialog] = useState<{ t?: Task } | null>(null);
  const [timing, setTiming] = useState<Task | null>(null);
  const [error, setError] = useState("");
  if (!q.data) return <Card className="h-32 animate-pulse" aria-busy />;
  const { stages, tasks, minutes, hasService } = q.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["execution", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const doneStages = stages.filter((s) => s.status === "done").length;
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "no_steps" ? "الخدمة المرتبطة بلا خطوات في «آلية العمل»." : "تعذّر تنفيذ العملية.",
      );
    }
  };

  return (
    <div className="space-y-6">
      {error && <Notice>{error}</Notice>}
      <section aria-label="مراحل المشروع">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            المراحل{" "}
            {stages.length > 0 && (
              <span className="text-sm font-normal text-muted">
                ({doneStages} من {stages.length})
              </span>
            )}
          </h2>
          {edit && hasService && stages.length === 0 && (
            <Button
              variant="secondary"
              onClick={() =>
                act(() => send("POST", `/api/tasks/projects/${projectId}/stages/from-service`))
              }
            >
              <Sparkles className="size-4" />
              توليد من آلية عمل الخدمة
            </Button>
          )}
        </div>
        {stages.length === 0 && (
          <EmptyState
            title="لا مراحل بعد"
            text={
              hasService
                ? "ولّدها من آلية عمل الخدمة المرتبطة أو أضف مراحلك."
                : "أضف مراحل التنفيذ لتتبّع التقدّم."
            }
          />
        )}
        <ol className="space-y-1.5">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${s.status === "done" ? "bg-brand text-white dark:text-canvas" : "bg-slate-100 dark:bg-slate-800"}`}
                >
                  {s.status === "done" ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={`truncate text-sm ${s.status === "done" ? "text-muted line-through" : ""}`}
                >
                  {s.title}
                </span>
              </span>
              <span className="flex items-center gap-1">
                {edit ? (
                  <button
                    type="button"
                    onClick={() =>
                      act(() =>
                        send("PATCH", `/api/tasks/stages/${s.id}`, { status: NEXT[s.status] }),
                      )
                    }
                    className="min-h-11 rounded-lg border px-3 text-xs hover:bg-brand-soft sm:min-h-8"
                    aria-label={`${s.title}: ${LABEL[s.status]}، اضغط للتغيير`}
                  >
                    {LABEL[s.status]}
                  </button>
                ) : (
                  <Badge>{LABEL[s.status]}</Badge>
                )}
                {edit && (
                  <Button
                    variant="ghost"
                    aria-label={`حذف مرحلة ${s.title}`}
                    onClick={() => act(() => send("DELETE", `/api/tasks/stages/${s.id}`))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ol>
        {edit && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!stageTitle.trim()) return;
              const title = stageTitle.trim();
              setStageTitle("");
              act(() => send("POST", `/api/tasks/projects/${projectId}/stages`, { title }));
            }}
          >
            <Input
              aria-label="مرحلة جديدة"
              placeholder="مرحلة جديدة"
              value={stageTitle}
              onChange={(e) => setStageTitle(e.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!stageTitle.trim()}>
              <Plus className="size-4" />
              إضافة
            </Button>
          </form>
        )}
      </section>

      <section aria-label="مهام المشروع">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            المهام{" "}
            <span className="text-sm font-normal text-muted">· الوقت المسجّل: {hours(minutes)}</span>
          </h2>
          {edit && (
            <Button onClick={() => setDialog({})}>
              <Plus className="size-4" />
              مهمة
            </Button>
          )}
        </div>
        {tasks.length === 0 && (
          <EmptyState title="لا مهام بعد" text="أضف مهمة وأسندها لأحد الفريق." />
        )}
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              canEdit={edit}
              onEdit={() => setDialog({ t })}
              onTime={() => setTiming(t)}
              onChanged={refresh}
            />
          ))}
        </ul>
      </section>

      {dialog && (
        <TaskDialog
          existing={dialog.t}
          projectId={projectId}
          stages={stages}
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
