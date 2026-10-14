import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Wallet } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { ReceiptDialog } from "../finance/Receipts";
import { companyKeys, type ReceiptProposal, receiptProposalsQuery } from "./company-api";

const WARNING_TEXT = {
  future: "تاريخ في المستقبل",
  before_contract: "قبل تاريخ العقد",
  near_quarter_edge: "قريب من حدّ الربع",
} as const;

/**
 * «مقترحات الاستلام للاعتماد»: for each project with no recorded receipt, the date the old
 * platform's data points to and the quarter it would fall in. Nothing counts until a person
 * checks the date (and amount) and approves — approving is what creates the receipt.
 */
export function ReceiptProposals() {
  const q = useQuery(receiptProposalsQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState<ReceiptProposal | null>(null);
  const items = q.data ?? [];
  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Wallet className="size-4" /> مقترحات الاستلام للاعتماد
      </h2>
      <p className="mb-3 text-xs text-muted">
        موعد الاستلام هو ما يحدد الربع. راجعوا التاريخ والمبلغ لكل مشروع ثم اعتمدوه؛ لا يُحتسب شيء
        قبل اعتمادكم. المبلغ المقترح هو كامل قيمة العقد، فعدّلوه إن كان الاستلام جزئياً.
      </p>
      {q.isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ) : items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CheckCircle2 className="size-4 text-emerald-600" /> لا مقترحات: كل المشاريع لها استلامات
          معتمدة.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {items.map((r) => (
            <li key={r.projectId} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <b>{r.name}</b>
                <span className="block text-xs text-muted">
                  {r.clientName} · قيمة العقد {sar(r.gross)}
                </span>
                {r.suggestion ? (
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span>
                      المقترح: <b>{day(r.suggestion.date)}</b>
                    </span>
                    <Badge tone="blue">{r.suggestion.quarter}</Badge>
                    {r.suggestion.warnings.map((w) => (
                      <Badge key={w} tone="amber">
                        {WARNING_TEXT[w]}
                      </Badge>
                    ))}
                    <span className="text-muted">{r.suggestion.basis}</span>
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                    لا تاريخ في بياناتها لاقتراحه، أدخلوا موعد الاستلام يدوياً.
                  </span>
                )}
              </span>
              <Button variant={r.suggestion ? "primary" : "secondary"} onClick={() => setOpen(r)}>
                {r.suggestion ? "مراجعة واعتماد" : "سجّل استلاماً"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ReceiptDialog
          projectId={open.projectId}
          receipt={null}
          remaining={open.gross}
          contractDate={open.contractDate}
          suggestion={open.suggestion ?? undefined}
          onClose={() => {
            setOpen(null);
            qc.invalidateQueries({ queryKey: companyKeys.all });
          }}
        />
      )}
    </Card>
  );
}
