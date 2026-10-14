import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Dialog, Field, Input, Notice } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { send } from "../team/queries";
import { scheduleQuery } from "./api";

/** A project's expected payments, on the project page. Marking one received creates the receipt. */
export function ScheduleCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const q = useQuery(scheduleQuery(projectId));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["schedule", projectId] });
    qc.invalidateQueries({ queryKey: ["receivables"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch {
      setError("تعذّر تنفيذ العملية.");
    }
  };
  const today = new Date().toISOString().slice(0, 10);
  const items = (q.data ?? []).filter((i) => i.status !== "cancelled");
  if (!canEdit && items.length === 0) return null;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">جدول الدفعات</h2>
        {canEdit && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            دفعة
          </Button>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
      {items.length === 0 && (
        <p className="text-sm text-muted">أضف الدفعات المنتظرة من العميل لتتابعها وتظهر أعمارها.</p>
      )}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{i.label}</span>
              <span
                className={`block text-xs ${i.status === "pending" && i.dueDate < today ? "font-semibold text-red-600" : "text-muted"}`}
              >
                {i.status === "received"
                  ? `استُلمت ${day(i.receivedAt)}`
                  : `${i.dueDate < today ? "متأخرة · " : "تستحق "}${day(i.dueDate)}`}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Badge tone={i.status === "received" ? "green" : "blue"}>{sar(i.amount)}</Badge>
              {canEdit && i.status === "pending" && (
                <>
                  <Button
                    variant="ghost"
                    aria-label={`تم استلام ${i.label}`}
                    onClick={() => run(() => send("POST", `/api/receivables/${i.id}/receive`, {}))}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`حذف ${i.label}`}
                    onClick={() => run(() => send("DELETE", `/api/receivables/${i.id}`))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {adding && (
        <Dialog open onOpenChange={(o) => !o && setAdding(false)} title="دفعة منتظرة">
          <div className="space-y-4">
            <Field label="الوصف">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="مثال: الدفعة الأولى"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="تاريخ الاستحقاق">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="المبلغ شامل الضريبة (ر.س)">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>
            <Button
              className="w-full"
              disabled={!label.trim() || !due || !(Number(amount) > 0)}
              onClick={async () => {
                await run(() =>
                  send("POST", `/api/receivables/projects/${projectId}`, {
                    label,
                    dueDate: due,
                    amount: Number(amount),
                  }),
                );
                setAdding(false);
                setLabel("");
                setDue("");
                setAmount("");
              }}
            >
              إضافة
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
