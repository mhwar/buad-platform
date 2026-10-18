import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSignature } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, confirmAction, cx, Segmented, toast } from "../../components/ui";
import { day, sar, today as todayIso } from "../../lib/format";
import { useCan } from "../../session";
import { companyKeys } from "../finance-overview/company-api";
import { invoicesQuery } from "../finance-overview/vat-api";
import { scheduleQuery } from "../receivables/api";
import { ScheduleCard } from "../receivables/ScheduleCard";
import { type Finance, financeApi, financeKey, financeQuery } from "./api";
import { EntryDialog } from "./EntryDialog";
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
      <Unclassified
        projectId={projectId}
        fin={f.data}
        canEdit={canEdit}
        collected={gross > 0 && received >= gross - 0.5}
      />
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

/**
 * «غير مصنّف»: what is left of the contract after every entry (gross − all entries). Once the
 * contract is collected it must not stay floating: it becomes profit (an income entry «فائض
 * المشروع») or a project expense. Before that it is only shown, since costs are still coming.
 */
function Unclassified({
  projectId,
  fin,
  canEdit,
  collected,
}: {
  projectId: string;
  fin: Finance;
  canEdit: boolean;
  collected: boolean;
}) {
  const qc = useQueryClient();
  const [expense, setExpense] = useState(false);
  const [busy, setBusy] = useState(false);
  const amount = Math.round(fin.summary.remainingFromGross * 100) / 100;
  if (amount <= 0.5) return null;
  const toProfit = async () => {
    const ok = await confirmAction({
      title: `تحويل ${sar(amount)} إلى أرباح؟`,
      text: "يُسجَّل قيد إيراد «فائض المشروع» بالمبلغ، فيدخل في ربح المشروع القابل للتوزيع.",
      action: "تحويل إلى أرباح",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await financeApi(projectId).addEntry({
        type: "income",
        cat: "other",
        description: "فائض المشروع",
        amount,
        status: "paid",
        date: todayIso(),
      });
      qc.setQueryData(financeKey(projectId), res);
      qc.invalidateQueries({ queryKey: companyKeys.all });
      toast("حُوّل المبلغ إلى أرباح");
    } catch {
      toast("تعذّر التحويل، حاولوا مرة أخرى", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label="مبلغ غير مصنّف"
      className={cx(
        "rounded-xl border p-3 text-sm",
        collected
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
          : "border-slate-200 dark:border-slate-700",
      )}
    >
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span>غير مصنّف من العقد</span>
        <b className="tabular-nums">{sar(amount)}</b>
      </p>
      <p className="mt-1 text-xs text-muted">
        {collected
          ? "حُصّل العقد كاملاً وبقي هذا المبلغ بلا قيد: صنّفوه أرباحاً أو مصروفاً للمشروع."
          : "العقد ناقص كل القيود. يُصنَّف بعد اكتمال التحصيل والمصروفات."}
      </p>
      {collected && canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={toProfit} disabled={busy}>
            تحويل إلى أرباح
          </Button>
          <Button variant="ghost" onClick={() => setExpense(true)} disabled={busy}>
            تحويل إلى مصروف
          </Button>
        </div>
      )}
      {expense && (
        <EntryDialog
          open={expense}
          onOpenChange={setExpense}
          projectId={projectId}
          fin={fin}
          preset={{ type: "expense", amount, description: "", date: todayIso() }}
        />
      )}
    </section>
  );
}
