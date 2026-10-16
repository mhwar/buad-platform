import { followUpState } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarClock, ShoppingCart, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../components/ui";
import { ago, day, sar, today } from "../../lib/format";
import { useCan } from "../../session";
import { requestsQuery } from "../products/products-api";
import { crmQuery, statementQuery } from "./api";

/**
 * The client at a glance, under its name: running work, open opportunities, what it still owes
 * and when we next speak to it — the same pulse the project page has.
 */
export function ClientPulse({
  clientId,
  active,
  total,
  onProjects,
  onCrm,
}: {
  clientId: string;
  active: number;
  total: number;
  onProjects: () => void;
  onCrm: () => void;
}) {
  const can = useCan();
  const reqs = useQuery({ ...requestsQuery(""), enabled: can("sales.view") });
  const st = useQuery({ ...statementQuery(clientId), enabled: can("finance.view") });
  const crm = useQuery(crmQuery(clientId));
  const open = (reqs.data?.requests ?? []).filter(
    (r) => r.clientId === clientId && !["won", "lost"].includes(r.status),
  );
  const openValue = open.reduce((s, r) => s + r.value, 0);
  const next = crm.data?.crm.nextFollowUpAt ?? "";
  const state = followUpState(next, today());
  const owed = st.data?.totals.owed ?? null;
  return (
    <ul
      aria-label="نبض العميل"
      className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 lg:grid-cols-4 dark:bg-slate-800"
    >
      <Cell icon={<Briefcase className="size-4" />} label="المشاريع" onClick={onProjects}>
        <b className="tabular-nums">{active}</b>{" "}
        <span className="text-xs text-muted">جارية من {total}</span>
      </Cell>
      <Cell icon={<ShoppingCart className="size-4" />} label="الفرص المفتوحة" onClick={onCrm}>
        {can("sales.view") ? (
          <>
            <b className="tabular-nums">{open.length}</b>
            {openValue > 0 && <span className="block text-xs text-muted">{sar(openValue)}</span>}
          </>
        ) : (
          <span className="text-sm text-muted">—</span>
        )}
      </Cell>
      <Cell icon={<Wallet className="size-4" />} label="المستحق على العميل">
        {owed === null ? (
          <span className="text-sm text-muted">—</span>
        ) : (
          <b className={cx("tabular-nums", owed > 0 && "text-amber-600")}>{sar(owed)}</b>
        )}
      </Cell>
      <Cell icon={<CalendarClock className="size-4" />} label="المتابعة" onClick={onCrm}>
        {next ? (
          <b
            className={cx(
              state === "overdue" && "text-red-600",
              state === "today" && "text-amber-600",
            )}
          >
            {state === "overdue" ? "متأخرة · " : state === "today" ? "اليوم · " : ""}
            {day(next)}
          </b>
        ) : (
          <span className="text-sm text-muted">لا متابعة محددة</span>
        )}
        <span className="block text-xs text-muted">
          {crm.data?.crm.lastContactAt
            ? `آخر تواصل ${ago(crm.data.crm.lastContactAt)}`
            : "لا تواصل بعد"}
        </span>
      </Cell>
    </ul>
  );
}

function Cell({
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
