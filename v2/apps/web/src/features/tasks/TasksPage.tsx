import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Columns3, List, Pencil, Plus, Table2 } from "lucide-react";
import { useState } from "react";
import { matches } from "../../components/shell/CommandPalette";
import { Badge, Button, cx, EmptyState, SearchBox, Segmented } from "../../components/ui";
import { day } from "../../lib/format";
import { useCan } from "../../session";
import { send } from "../team/queries";
import {
  isOverdue,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Task,
  type TaskStatus,
  tasksQuery,
} from "./queries";
import { TaskDialog, TimeDialog } from "./TaskDialogs";
import { TaskRow } from "./TaskRow";

type Scope = "mine" | "all";
type Show = "open" | "late" | "done";
type Layout = "list" | "board" | "table";
export type TasksSearch = {
  scope?: Scope;
  show?: Show;
  layout?: Layout;
  q?: string;
  project?: string;
};

const STATUSES = Object.keys(STATUS_LABEL) as TaskStatus[];
/** The done column of the board keeps the latest few; the «منجزة» filter has them all. */
const DONE_ON_BOARD = 8;

/**
 * «المهام»: mine or the whole team's, across projects and company work — as a list, a board by
 * status, or a table. What you pick lives in the address, so a filtered view can be shared.
 */
export function TasksPage() {
  const can = useCan();
  const edit = can("tasks.edit");
  const qc = useQueryClient();
  const s = useSearch({ strict: false }) as TasksSearch;
  const navigate = useNavigate();
  const set = (patch: Partial<TasksSearch>) =>
    navigate({
      search: ((prev: TasksSearch) => ({ ...prev, ...patch })) as never,
      replace: true,
    } as never);
  const scope = s.scope ?? "mine";
  const view = s.show ?? "open";
  const layout = s.layout ?? "list";
  const q = useQuery(tasksQuery({ mine: scope === "mine" }));
  const [dialog, setDialog] = useState<{ t?: Task } | null>(null);
  const [timing, setTiming] = useState<Task | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["execution"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const all = q.data ?? [];
  const projects = [
    ...new Map(all.filter((t) => t.projectId).map((t) => [t.projectId, t.projectName ?? ""])),
  ];
  // Text and project narrow every layout; the open/late/done filter applies to list and table.
  const pool = all.filter(
    (t) =>
      (!s.project || t.projectId === s.project) &&
      (!s.q || matches(`${t.title} ${t.projectName ?? ""} ${t.assigneeName}`, s.q)),
  );
  const items = pool.filter((t) =>
    view === "done" ? t.status === "done" : view === "late" ? isOverdue(t) : t.status !== "done",
  );
  const counts = {
    open: pool.filter((t) => t.status !== "done").length,
    late: pool.filter((t) => isOverdue(t)).length,
    done: pool.filter((t) => t.status === "done").length,
  };
  const shown = layout === "board" ? pool : items;
  const rowProps = (t: Task) => ({
    t,
    canEdit: edit,
    onEdit: () => setDialog({ t }),
    onTime: () => setTiming(t),
    onChanged: refresh,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="النطاق"
            value={scope}
            onChange={(v) => set({ scope: v === "mine" ? undefined : v })}
            items={[
              { value: "mine", label: "مهامي" },
              { value: "all", label: "كل الفريق" },
            ]}
          />
          {layout !== "board" && (
            <Segmented
              label="العرض"
              value={view}
              onChange={(v) => set({ show: v === "open" ? undefined : v })}
              items={[
                { value: "open", label: `مفتوحة (${counts.open})` },
                { value: "late", label: `متأخرة (${counts.late})` },
                { value: "done", label: `منجزة (${counts.done})` },
              ]}
            />
          )}
          <Segmented
            label="طريقة العرض"
            value={layout}
            onChange={(v) => set({ layout: v === "list" ? undefined : v })}
            items={[
              { value: "list", label: "قائمة", icon: <List className="size-4" /> },
              { value: "board", label: "لوحة", icon: <Columns3 className="size-4" /> },
              { value: "table", label: "جدول", icon: <Table2 className="size-4" /> },
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox
            value={s.q ?? ""}
            onChange={(v) => set({ q: v || undefined })}
            placeholder="ابحث في المهام بالعنوان أو المشروع أو المسؤول"
          />
        </div>
        {projects.length > 0 && (
          <select
            aria-label="المشروع"
            value={s.project ?? ""}
            onChange={(e) => set({ project: e.target.value || undefined })}
            className="min-h-11 max-w-full rounded-lg border bg-surface px-2 text-sm"
          >
            <option value="">كل المشاريع</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>
                {name || "مشروع"}
              </option>
            ))}
          </select>
        )}
      </div>
      {q.isSuccess && shown.length === 0 && (
        <EmptyState
          title={
            s.q || s.project
              ? "لا مهام تطابق البحث"
              : layout === "board"
                ? "لا مهام بعد"
                : view === "late"
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
      {shown.length > 0 && layout === "board" && (
        <TaskBoard tasks={pool} edit={edit} onChanged={refresh} row={rowProps} />
      )}
      {shown.length > 0 && layout === "table" && (
        <>
          <div className="hidden md:block">
            <TaskTable
              tasks={items}
              edit={edit}
              onEdit={(t) => setDialog({ t })}
              onChanged={refresh}
            />
          </div>
          {/* A wide table does not fit a phone: the same tasks as rows. */}
          <ul className="grid gap-2 md:hidden">
            {items.map((t) => (
              <TaskRow key={t.id} showProject {...rowProps(t)} />
            ))}
          </ul>
        </>
      )}
      {shown.length > 0 && layout === "list" && (
        <ul className="grid gap-2 lg:grid-cols-2">
          {items.map((t) => (
            <TaskRow key={t.id} showProject {...rowProps(t)} />
          ))}
        </ul>
      )}
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

const setStatus = async (id: string, status: TaskStatus) =>
  send("PATCH", `/api/tasks/${id}`, { status });

/**
 * A column per status. Cards move by dragging; each card keeps its status menu too, so it works
 * from the keyboard and on touch. On a phone the columns scroll sideways inside the board.
 */
function TaskBoard({
  tasks,
  edit,
  onChanged,
  row,
}: {
  tasks: Task[];
  edit: boolean;
  onChanged: () => void;
  row: (t: Task) => Parameters<typeof TaskRow>[0];
}) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  return (
    <div
      className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-3"
      role="list"
      aria-label="المهام حسب الحالة"
    >
      {STATUSES.map((st) => {
        let col = tasks.filter((t) => t.status === st);
        const total = col.length;
        if (st === "done")
          col = [...col].sort((a, b) => b.doneAt - a.doneAt).slice(0, DONE_ON_BOARD);
        else
          col = [...col].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
        return (
          <section
            key={st}
            role="listitem"
            aria-label={STATUS_LABEL[st]}
            onDragOver={(e) => {
              if (!edit) return;
              e.preventDefault();
              setOver(st);
            }}
            onDragLeave={() => setOver((o) => (o === st ? null : o))}
            onDrop={async (e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/task");
              const t = tasks.find((x) => x.id === id);
              if (!edit || !t || t.status === st) return;
              await setStatus(id, st);
              onChanged();
            }}
            className={cx(
              "flex w-[17rem] shrink-0 flex-col rounded-2xl border p-2 transition lg:w-auto lg:min-w-0 lg:flex-1",
              over === st ? "border-brand bg-brand-soft/60" : "bg-slate-50 dark:bg-slate-900/40",
            )}
          >
            <header className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold">{STATUS_LABEL[st]}</h3>
              <span className="rounded-full bg-surface px-2 text-xs text-muted">{total}</span>
            </header>
            <ul className="flex min-h-24 flex-col gap-2">
              {col.map((t) => (
                <TaskRow key={t.id} {...row(t)} showProject compact draggable={edit} />
              ))}
              {col.length === 0 && (
                <li className="rounded-xl border border-dashed p-4 text-center text-xs text-muted">
                  لا شيء هنا
                </li>
              )}
              {st === "done" && total > col.length && (
                <li className="px-1 text-xs text-muted">
                  وأقدم منها {total - col.length} في «منجزة»
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskTable({
  tasks,
  edit,
  onEdit,
  onChanged,
}: {
  tasks: Task[];
  edit: boolean;
  onEdit: (t: Task) => void;
  onChanged: () => void;
}) {
  const rows = [...tasks].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  return (
    <div className="overflow-x-auto rounded-2xl border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-muted dark:bg-slate-900/40">
          <tr>
            {["المهمة", "المشروع", "المسؤول", "الأولوية", "الموعد", "الحالة", ""].map((h) => (
              <th key={h} className="px-3 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const late = isOverdue(t);
            return (
              <tr key={t.id} className="border-t">
                <td
                  className={cx(
                    "px-3 py-2 font-medium",
                    t.status === "done" && "text-muted line-through",
                  )}
                >
                  {t.title}
                </td>
                <td className="px-3 py-2 text-muted">{t.projectName || "—"}</td>
                <td className="px-3 py-2 text-muted">{t.assigneeName || "—"}</td>
                <td className="px-3 py-2">
                  {t.priority === "high" ? (
                    <Badge tone="red">{PRIORITY_LABEL.high}</Badge>
                  ) : (
                    PRIORITY_LABEL[t.priority]
                  )}
                </td>
                <td className={cx("px-3 py-2 tabular-nums", late && "font-semibold text-red-600")}>
                  {t.dueDate ? `${late ? "متأخرة · " : ""}${day(t.dueDate)}` : "—"}
                </td>
                <td className="px-3 py-2">
                  {edit ? (
                    <select
                      aria-label={`حالة ${t.title}`}
                      value={t.status}
                      onChange={async (e) => {
                        await setStatus(t.id, e.target.value as TaskStatus);
                        onChanged();
                      }}
                      className="min-h-8 rounded-lg border bg-surface px-2 text-sm"
                    >
                      {STATUSES.map((x) => (
                        <option key={x} value={x}>
                          {STATUS_LABEL[x]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge>{STATUS_LABEL[t.status]}</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {edit && (
                    <Button
                      variant="ghost"
                      aria-label={`تعديل ${t.title}`}
                      onClick={() => onEdit(t)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
