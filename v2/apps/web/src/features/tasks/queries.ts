import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export type Task = {
  id: string;
  projectId: string;
  stageId: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeName: string;
  projectName?: string;
  status: TaskStatus;
  priority: "low" | "normal" | "high";
  startDate: string;
  dueDate: string;
  doneAt: number;
};
export type Stage = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  dueDate: string;
  sort: number;
  source: string;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "لم تبدأ",
  doing: "قيد التنفيذ",
  blocked: "معلّقة",
  done: "منجزة",
};
export const PRIORITY_LABEL = { low: "منخفضة", normal: "عادية", high: "عالية" } as const;

export const tasksQuery = (f: { mine?: boolean; status?: string; overdue?: boolean }) =>
  queryOptions({
    queryKey: ["tasks", f],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (f.mine) p.set("mine", "1");
      if (f.status) p.set("status", f.status);
      if (f.overdue) p.set("overdue", "1");
      return (await ok<{ items: Task[] }>(await fetch(`/api/tasks?${p}`))).items;
    },
  });
export const executionQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["execution", projectId],
    queryFn: async () =>
      ok<{ stages: Stage[]; tasks: Task[]; minutes: number; hasService: boolean }>(
        await fetch(`/api/tasks/projects/${projectId}`),
      ),
  });
export const assigneesQuery = queryOptions({
  queryKey: ["task-assignees"],
  queryFn: async () =>
    (
      await ok<{ users: { id: string; name: string; email: string }[] }>(
        await fetch("/api/tasks/assignees"),
      )
    ).users,
  staleTime: 5 * 60_000,
});

export const isOverdue = (
  t: { status: string; dueDate: string },
  today = new Date().toISOString().slice(0, 10),
) => t.status !== "done" && !!t.dueDate && t.dueDate < today;
export const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} س ${m} د` : `${h} س`) : `${m} د`;
};
