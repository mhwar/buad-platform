import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileSignature } from "lucide-react";
import { useState } from "react";
import { Badge, Card, cx, Segmented } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { useCan } from "../../session";
import { invoicesQuery } from "../finance-overview/vat-api";
import { scheduleQuery } from "../receivables/api";
import { ScheduleCard } from "../receivables/ScheduleCard";
import { financeQuery } from "./api";
import { ContractSummary } from "./FinanceTab";
import { ReceiptsCard } from "./Receipts";
import { SalesInvoices } from "./SalesInvoices";

type Part = "summary" | "receipts" | "invoices" | "schedule";

/**
 * «العقد والتحصيل»: one card for the contract and the money owed on it. The head always says
 * what the contract is worth, how much has come in and what is due next; the parts below hold the
 * breakdown, the receipts and the payment schedule. Opens on the schedule when a payment is late.
 */
export function ContractCard({
  projectId,
  canEdit,
  onSettings,
}: {
  projectId: string;
  canEdit: boolean;
  onSettings: () => void;
}) {
  const f = useQuery(financeQuery(projectId));
  const sched = useQuery(scheduleQuery(projectId));
  const today = new Date().toISOString().slice(0, 10);
  const pending = (sched.data ?? [])
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = pending[0];
  const late = !!next && next.dueDate < today;
  const [part, setPart] = useState<Part | null>(null);
  const can = useCan();
  const vatView = can("vat.view");
  const vatEdit = can("vat.edit");
  const invoices = useQuery({ ...invoicesQuery(projectId), enabled: vatView });
  if (!f.data) return null;
  const gross = f.data.summary.grossTotal;
  const received = f.data.received;
  const share = gross > 0 ? Math.min(1, Math.max(0, received / gross)) : 0;
  const shown: Part = part ?? (late ? "schedule" : "summary");
  return (
    <Card className="space-y-4" aria-label="العقد والتحصيل">
      <div>
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <FileSignature className="size-4" />
          العقد والتحصيل
        </h2>
        <p className="text-2xl font-bold tabular-nums">{sar(gross)}</p>
        <p className="text-xs text-muted">
          {f.data.ctrl.vatIncluded ? "شاملة الضريبة" : `+ ضريبة ${f.data.ctrl.vatPct}%`}
        </p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>
            حُصّل {sar(received)} من {sar(gross)}
          </span>
          <span className="tabular-nums">{Math.round(share * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            المتبقي على العميل: <b className="tabular-nums">{sar(Math.max(0, gross - received))}</b>
          </span>
          {next && (
            <Badge tone={late ? "red" : "blue"}>
              <CalendarClock className="me-1 inline size-3" />
              {late ? "دفعة متأخرة" : "الدفعة القادمة"} · {day(next.dueDate)}
            </Badge>
          )}
        </p>
      </div>
      <Segmented<Part>
        label="أقسام العقد"
        value={shown}
        onChange={setPart}
        items={[
          { value: "summary", label: "الملخص" },
          { value: "receipts", label: `الاستلامات (${f.data.receipts.length})` },
          ...(vatView
            ? [{ value: "invoices" as const, label: `الفواتير (${invoices.data?.length ?? 0})` }]
            : []),
          { value: "schedule", label: `الدفعات (${pending.length})` },
        ]}
      />
      <div className={cx(shown !== "summary" && "hidden")}>
        <ContractSummary projectId={projectId} canEdit={canEdit} onSettings={onSettings} embedded />
      </div>
      {shown === "receipts" && <ReceiptsCard projectId={projectId} canEdit={canEdit} embedded />}
      {shown === "invoices" && <SalesInvoices projectId={projectId} canEdit={canEdit && vatEdit} />}
      {shown === "schedule" && <ScheduleCard projectId={projectId} canEdit={canEdit} embedded />}
    </Card>
  );
}
