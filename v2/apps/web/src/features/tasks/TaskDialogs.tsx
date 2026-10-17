import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
  toast,
} from "../../components/ui";
import { send } from "../team/queries";
import {
  assigneesQuery,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Stage,
  type Task,
  type TaskStatus,
} from "./queries";

export function TaskDialog({
  existing,
  projectId = "",
  initiativeId = "",
  stages = [],
  onClose,
  onSaved,
}: {
  existing?: Task;
  projectId?: string;
  /** Filed under a plan initiative (its progress follows its tasks). */
  initiativeId?: string;
  stages?: Stage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const people = useQuery(assigneesQuery);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [assigneeId, setAssigneeId] = useState(existing?.assigneeId ?? "");
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "todo");
  const [priority, setPriority] = useState(existing?.priority ?? "normal");
  const [due, setDue] = useState(existing?.dueDate ?? "");
  const [stageId, setStageId] = useState(existing?.stageId ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    const body = {
      title,
      description,
      assigneeId,
      status,
      priority,
      dueDate: due,
      ...(stages.length ? { stageId } : {}),
    };
    try {
      await (existing
        ? send("PATCH", `/api/tasks/${existing.id}`, body)
        : send("POST", "/api/tasks", {
            ...body,
            projectId: projectId,
            ...(initiativeId ? { initiativeId } : {}),
          }));
      toast(existing ? "حُفظت المهمة" : "أُضيفت المهمة");
      onSaved();
    } catch {
      setError("تعذّر الحفظ، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "تعديل المهمة" : "مهمة جديدة"}
      wide
      footer={
        <DialogActions onCancel={onClose}>
          <Button disabled={busy || !title.trim()} onClick={save}>
            {existing ? "حفظ" : "إضافة المهمة"}
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <Field label="المهمة">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="تفاصيل">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المسؤول">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— غير محدد —</option>
              {people.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الموعد">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الأولوية">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
            >
              {(Object.keys(PRIORITY_LABEL) as (keyof typeof PRIORITY_LABEL)[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          {stages.length > 0 && (
            <Field label="المرحلة" className="sm:col-span-2">
              <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">— بلا مرحلة —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function TimeDialog({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [hoursText, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`تسجيل وقت: ${task.title}`}
      footer={
        <DialogActions onCancel={onClose}>
          <Button
            disabled={!(Number(hoursText) > 0)}
            onClick={async () => {
              try {
                await send("POST", `/api/tasks/${task.id}/time`, {
                  minutes: Math.max(1, Math.round(Number(hoursText) * 60)),
                  date: new Date().toISOString().slice(0, 10),
                  note,
                });
                onSaved();
              } catch {
                setError("تعذّر الحفظ.");
              }
            }}
          >
            تسجيل الوقت
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <Field label="عدد الساعات">
          <Input
            type="number"
            inputMode="decimal"
            min={0.25}
            step={0.25}
            value={hoursText}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
        <Field label="ملاحظة">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
