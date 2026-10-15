import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, Field, Input, Notice, Select, Textarea } from "../../components/ui";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import type { Decision } from "./api";

/** Record a decision: what, who carries it out, and by when. */
export function DecisionDialog({
  existing,
  meetingId = "",
  onClose,
}: {
  existing?: Decision;
  meetingId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const people = useQuery(assigneesQuery);
  const [f, setF] = useState({
    title: existing?.title ?? "",
    details: existing?.details ?? "",
    ownerId: existing?.ownerId ?? "",
    dueDate: existing?.dueDate ?? "",
  });
  const [error, setError] = useState("");
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () =>
      existing
        ? send("PATCH", `/api/decisions/${existing.id}`, f)
        : send("POST", "/api/decisions", { ...f, meetingId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["attention"] });
      onClose();
    },
    onError: () => setError("تعذّر الحفظ"),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={existing ? "تعديل القرار" : "قرار جديد"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {error && <Notice>{error}</Notice>}
        <Field label="القرار">
          <Input value={f.title} onChange={set("title")} placeholder="ما الذي تقرّر؟" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المسؤول عن التنفيذ">
            <Select value={f.ownerId} onChange={set("ownerId")}>
              <option value="">— غير محدد —</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الموعد">
            <Input type="date" value={f.dueDate} onChange={set("dueDate")} />
          </Field>
        </div>
        <Field label="تفاصيل (اختياري)">
          <Textarea rows={3} value={f.details} onChange={set("details")} />
        </Field>
        <Button type="submit" className="w-full" disabled={!f.title.trim() || save.isPending}>
          حفظ القرار
        </Button>
      </form>
    </Dialog>
  );
}
