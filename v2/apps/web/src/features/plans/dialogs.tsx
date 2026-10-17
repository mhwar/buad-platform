import { PLATFORM_METRICS } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Button, Dialog, DialogActions, Field, Input, Notice, Select } from "../../components/ui";
import { send } from "../team/queries";
import {
  type Cycle,
  type Indicator,
  type Initiative,
  type Objective,
  ownersQuery,
} from "./queries";

type Close = { onClose: () => void; onSaved: () => void };
const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? 0 : Number(s));

function Shell({
  title,
  onClose,
  children,
  error,
  action,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  error: string;
  action: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      wide
      footer={<DialogActions onCancel={onClose}>{action}</DialogActions>}
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {children}
      </div>
    </Dialog>
  );
}

function useSave(onSaved: () => void) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "end_before_start" ? "تاريخ النهاية قبل البداية." : "تعذّر الحفظ، حاول مرة أخرى.",
      );
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const owners = useQuery(ownersQuery);
  return (
    <Field label="المسؤول">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— غير محدد —</option>
        {owners.data?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name || o.email}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CycleDialog({
  kind,
  strategic,
  onClose,
  onSaved,
}: Close & { kind: "strategic" | "operational"; strategic: Cycle[] }) {
  const year = new Date().getFullYear();
  const [name, setName] = useState(
    kind === "strategic" ? `الخطة الاستراتيجية ${year}–${year + 2}` : `الخطة التشغيلية ${year}`,
  );
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(kind === "strategic" ? `${year + 2}-12-31` : `${year}-12-31`);
  const [parent, setParent] = useState(strategic[0]?.id ?? "");
  const { error, busy, run } = useSave(onSaved);
  return (
    <Shell
      title={kind === "strategic" ? "خطة استراتيجية جديدة" : "خطة تشغيلية جديدة"}
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            run(() =>
              send("POST", "/api/plans/cycles", {
                kind,
                name,
                startDate: start,
                endDate: end,
                parentCycleId: kind === "operational" ? parent : "",
              }),
            )
          }
        >
          إنشاء
        </Button>
      }
    >
      <Field label="اسم الخطة">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="تبدأ">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="تنتهي">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      {kind === "operational" && strategic.length > 0 && (
        <Field label="الخطة الاستراتيجية التي تخدمها">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— بلا ربط —</option>
            {strategic.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Shell>
  );
}

export function IdentityDialog({ cycle, onClose, onSaved }: Close & { cycle: Cycle }) {
  const [vision, setVision] = useState(cycle.vision);
  const [mission, setMission] = useState(cycle.mission);
  const [values, setValues] = useState(cycle.values.join("\n"));
  const [name, setName] = useState(cycle.name);
  const [status, setStatus] = useState(cycle.status);
  const { error, busy, run } = useSave(onSaved);
  const area = "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base sm:text-sm";
  return (
    <Shell
      title="تعديل الخطة"
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            run(() =>
              send("PATCH", `/api/plans/cycles/${cycle.id}`, {
                version: cycle.version,
                name,
                vision,
                mission,
                status,
                values: values
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              }),
            )
          }
        >
          حفظ
        </Button>
      }
    >
      <Field label="اسم الخطة">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="الرؤية">
        <textarea
          className={area}
          rows={2}
          value={vision}
          onChange={(e) => setVision(e.target.value)}
        />
      </Field>
      <Field label="الرسالة">
        <textarea
          className={area}
          rows={2}
          value={mission}
          onChange={(e) => setMission(e.target.value)}
        />
      </Field>
      <Field label="القيم" hint="قيمة في كل سطر">
        <textarea
          className={area}
          rows={4}
          value={values}
          onChange={(e) => setValues(e.target.value)}
        />
      </Field>
      <Field label="الحالة">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Cycle["status"])}>
          <option value="draft">مسودة</option>
          <option value="active">معتمدة وجارية</option>
          <option value="closed">مغلقة</option>
        </Select>
      </Field>
    </Shell>
  );
}

export function ObjectiveDialog({
  cycle,
  existing,
  strategicObjectives,
  onClose,
  onSaved,
}: Close & {
  cycle: Cycle;
  existing?: Objective;
  strategicObjectives: { id: string; title: string }[];
}) {
  const operational = cycle.kind === "operational";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [ownerId, setOwnerId] = useState(existing?.ownerId ?? "");
  const [quarter, setQuarter] = useState(String(existing?.quarter ?? 0));
  const [parentId, setParentId] = useState(existing?.parentId ?? "");
  const [weight, setWeight] = useState(String(existing?.weight ?? 1));
  const [budget, setBudget] = useState(String(existing?.budget ?? 0));
  const { error, busy, run } = useSave(onSaved);
  const body = {
    title,
    description,
    ownerId,
    weight: Math.min(10, Math.max(1, Math.round(num(weight)) || 1)),
    budget: num(budget),
    ...(operational ? { quarter: Number(quarter), parentId } : {}),
  };
  return (
    <Shell
      title={existing ? "تعديل الهدف" : "هدف جديد"}
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy || !title.trim()}
          onClick={() =>
            run(() =>
              existing
                ? send("PATCH", `/api/plans/objectives/${existing.id}`, body)
                : send("POST", "/api/plans/objectives", { cycleId: cycle.id, ...body }),
            )
          }
        >
          حفظ
        </Button>
      }
    >
      <Field label="الهدف">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="وصف مختصر">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
        <Field label="الميزانية (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
        <Field label="الوزن (1–10)" hint="الأهم وزنه أكبر في تقدّم الخطة">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        {operational && (
          <Field label="الربع">
            <Select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
              <option value="0">كل السنة</option>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  الربع {q}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {operational && (
        <Field label="الهدف الاستراتيجي الذي يخدمه">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— غير مرتبط —</option>
            {strategicObjectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Shell>
  );
}

export function IndicatorDialog({
  objectiveId,
  existing,
  onClose,
  onSaved,
}: Close & { objectiveId: string; existing?: Indicator }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [baseline, setBaseline] = useState(String(existing?.baseline ?? 0));
  const [target, setTarget] = useState(String(existing?.target ?? ""));
  const [current, setCurrent] = useState(String(existing?.current ?? 0));
  const [source, setSource] = useState(existing?.source ?? "manual");
  const [direction, setDirection] = useState(existing?.direction ?? "up");
  const { error, busy, run } = useSave(onSaved);
  const manual = source === "manual";
  const body = {
    name,
    unit,
    baseline: num(baseline),
    target: num(target),
    current: num(current),
    source,
    direction,
  };
  return (
    <Shell
      title={existing ? "تعديل المؤشر" : "مؤشر أداء جديد"}
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy || !name.trim() || target.trim() === ""}
          onClick={() =>
            run(() =>
              existing
                ? send("PATCH", `/api/plans/indicators/${existing.id}`, body)
                : send("POST", `/api/plans/objectives/${objectiveId}/indicators`, body),
            )
          }
        >
          حفظ
        </Button>
      }
    >
      <Field label="اسم المؤشر">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label="مصدر القيمة"
        hint={manual ? "تُدخل القيمة الحالية بنفسك." : "تُحسب القيمة من بيانات المنصة في فترة الهدف."}
      >
        <Select
          value={source}
          onChange={(e) => {
            const v = e.target.value;
            setSource(v);
            const m = PLATFORM_METRICS.find((x) => `platform:${x.key}` === v);
            if (m) {
              if (!name.trim()) setName(m.label);
              setUnit(m.unit);
            }
          }}
        >
          <option value="manual">إدخال يدوي</option>
          {PLATFORM_METRICS.map((m) => (
            <option key={m.key} value={`platform:${m.key}`}>
              من المنصة: {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="القيمة الابتدائية">
          <Input
            type="number"
            inputMode="decimal"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
          />
        </Field>
        <Field label="المستهدف">
          <Input
            type="number"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        {manual && (
          <Field label="القيمة الحالية">
            <Input
              type="number"
              inputMode="decimal"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
        )}
        <Field label="الوحدة">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
      </div>
      <Field label="الأفضل">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down")}>
          <option value="up">الأعلى أفضل</option>
          <option value="down">الأقل أفضل</option>
        </Select>
      </Field>
    </Shell>
  );
}

export function InitiativeDialog({
  objectiveId,
  existing,
  onClose,
  onSaved,
}: Close & { objectiveId: string; existing?: Initiative }) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [ownerId, setOwnerId] = useState(existing?.ownerId ?? "");
  const [start, setStart] = useState(existing?.startDate ?? "");
  const [due, setDue] = useState(existing?.dueDate ?? "");
  const [budget, setBudget] = useState(String(existing?.budget ?? 0));
  const [status, setStatus] = useState(existing?.status ?? "todo");
  const { error, busy, run } = useSave(onSaved);
  const body = { title, ownerId, startDate: start, dueDate: due, budget: num(budget), status };
  return (
    <Shell
      title={existing ? "تعديل المبادرة" : "مبادرة جديدة"}
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy || !title.trim()}
          onClick={() =>
            run(() =>
              existing
                ? send("PATCH", `/api/plans/initiatives/${existing.id}`, body)
                : send("POST", `/api/plans/objectives/${objectiveId}/initiatives`, body),
            )
          }
        >
          حفظ
        </Button>
      }
    >
      <Field label="المبادرة">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <OwnerSelect value={ownerId} onChange={setOwnerId} />
        <Field label="الحالة">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Initiative["status"])}
          >
            <option value="todo">لم تبدأ</option>
            <option value="doing">قيد التنفيذ</option>
            <option value="blocked">متعثرة</option>
            <option value="done">منجزة</option>
          </Select>
        </Field>
        <Field label="تبدأ">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="موعد الإنجاز">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="الميزانية (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
      </div>
    </Shell>
  );
}

export function ReviewDialog({ objective, onClose, onSaved }: Close & { objective: Objective }) {
  const [note, setNote] = useState("");
  const [quarter, setQuarter] = useState(String(objective.quarter));
  const { error, busy, run } = useSave(onSaved);
  return (
    <Shell
      title="مراجعة الهدف"
      onClose={onClose}
      error={error}
      action={
        <Button
          disabled={busy}
          onClick={() =>
            run(() =>
              send("POST", `/api/plans/objectives/${objective.id}/reviews`, {
                quarter: Number(quarter),
                note,
              }),
            )
          }
        >
          حفظ المراجعة
        </Button>
      }
    >
      <p className="text-sm text-muted">
        تُحفظ ملاحظتك مع أرقام المؤشرات والمبادرات كما هي الآن، لتقارن بها لاحقاً.
      </p>
      <Field label="الربع">
        <Select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
          <option value="0">عام</option>
          {[1, 2, 3, 4].map((q) => (
            <option key={q} value={q}>
              الربع {q}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ملاحظات المراجعة">
        <textarea
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base sm:text-sm"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Shell>
  );
}
