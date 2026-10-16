import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ListChecks, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { useCan } from "../../session";
import { scheduleQuery } from "../receivables/api";
import { executionQuery } from "../tasks/queries";

const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);

/**
 * The project's pulse, beside its money: how far the work is, how much time is left, the next task
 * and the next instalment — what the finance strip does not say.
 */
export function ProjectPulse({
  projectId,
  status,
  endDate,
  onExecution,
}: {
  projectId: string;
  status: string;
  endDate: string;
  onExecution: () => void;
}) {
  const can = useCan();
  const ex = useQuery({ ...executionQuery(projectId), enabled: can("tasks.view") });
  const sched = useQuery({ ...scheduleQuery(projectId), enabled: can("finance.view") });
  const stages = ex.data?.stages ?? [];
  const tasks = ex.data?.tasks ?? [];
  const work = stages.length
    ? {
        done: stages.filter((s) => s.status === "done").length,
        total: stages.length,
        what: "مرحلة",
      }
    : tasks.length
      ? { done: tasks.filter((t) => t.status === "done").length, total: tasks.length, what: "مهمة" }
      : null;
  const t = today();
  const nextTask = tasks
    .filter((x) => x.status !== "done" && x.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const nextPay = (sched.data ?? [])
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const left = endDate ? daysTo(endDate) : null;
  const running = status === "active";

  return (
    <ul
      aria-label="نبض المشروع"
      className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 lg:grid-cols-4 dark:bg-slate-800"
    >
      <Pulse icon={<ListChecks className="size-4" />} label="التنفيذ" onClick={onExecution}>
        {work ? (
          <>
            <b className="tabular-nums">
              {work.done}/{work.total}
            </b>{" "}
            <span className="text-xs text-muted">{work.what}</span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.round((work.done / work.total) * 100)}%` }}
              />
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">لم تُضف مراحل أو مهام</span>
        )}
      </Pulse>
      <Pulse icon={<CalendarDays className="size-4" />} label="الموعد">
        {left === null ? (
          <span className="text-sm text-muted">بلا تاريخ انتهاء</span>
        ) : running && left < 0 ? (
          <b className="text-red-600">متأخر {-left} يوم</b>
        ) : running ? (
          <b className={cx(left <= 7 && "text-amber-600")}>متبقٍ {left} يوم</b>
        ) : (
          <b>{day(endDate)}</b>
        )}
        {endDate && <span className="block text-xs text-muted">الانتهاء {day(endDate)}</span>}
      </Pulse>
      <Pulse
        icon={<CalendarClock className="size-4" />}
        label="المهمة التالية"
        onClick={onExecution}
      >
        {nextTask ? (
          <>
            <span className="block truncate text-sm font-semibold">{nextTask.title}</span>
            <span
              className={cx(
                "text-xs",
                nextTask.dueDate < t ? "font-semibold text-red-600" : "text-muted",
              )}
            >
              {nextTask.dueDate < t ? "متأخرة · " : ""}
              {day(nextTask.dueDate)}
              {nextTask.assigneeName && ` · ${nextTask.assigneeName}`}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">لا مهام بموعد</span>
        )}
      </Pulse>
      <Pulse icon={<Wallet className="size-4" />} label="الدفعة القادمة">
        {!can("finance.view") ? (
          <span className="text-sm text-muted">—</span>
        ) : nextPay ? (
          <>
            <b className="tabular-nums">{sar(nextPay.amount)}</b>
            <span
              className={cx(
                "block text-xs",
                nextPay.dueDate < t ? "font-semibold text-red-600" : "text-muted",
              )}
            >
              {nextPay.dueDate < t ? "متأخرة · " : ""}
              {nextPay.label} · {day(nextPay.dueDate)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">لا دفعات منتظرة</span>
        )}
      </Pulse>
    </ul>
  );
}

function Pulse({
  icon,
  label,
  children,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="mb-1 flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </span>
      {children}
    </>
  );
  return (
    <li className="min-w-0 bg-surface">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="block h-full w-full p-3 text-start hover:bg-brand-soft/40"
        >
          {body}
        </button>
      ) : (
        <div className="p-3">{body}</div>
      )}
    </li>
  );
}
