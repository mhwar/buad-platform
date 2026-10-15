import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, cx, Dialog, Field, Input, Notice, Select, Textarea } from "../../components/ui";
import { useCan } from "../../session";
import { clientsQuery } from "../clients/api";
import { requestsQuery } from "../products/products-api";
import { projectsQuery } from "../projects/api";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import { addDaysLocal, type Meeting } from "./api";

/** Plan a meeting, or edit one: when, where, who, and what it is about. */
export function MeetingDialog({
  existing,
  seed,
  onClose,
  onSaved,
}: {
  existing?: Meeting;
  /** Pre-filled links (from a client, opportunity or project page). */
  seed?: { clientId?: string; requestId?: string; projectId?: string; title?: string };
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const [f, setF] = useState({
    title: existing?.title ?? seed?.title ?? "",
    day: existing?.startsAt.slice(0, 10) ?? addDaysLocal(1),
    time: existing?.startsAt.slice(11, 16) ?? "10:00",
    durationMin: String(existing?.durationMin ?? 60),
    location: existing?.location ?? "",
    clientId: existing?.clientId ?? seed?.clientId ?? "",
    requestId: existing?.requestId ?? seed?.requestId ?? "",
    projectId: existing?.projectId ?? seed?.projectId ?? "",
    agenda: existing?.agenda ?? "",
  });
  const [who, setWho] = useState<string[]>(existing?.attendees.map((a) => a.id) ?? []);
  const [error, setError] = useState("");
  const people = useQuery(assigneesQuery);
  const clients = useQuery({ ...clientsQuery({ sort: "name" }), enabled: can("clients.view") });
  const reqs = useQuery({ ...requestsQuery(""), enabled: can("sales.view") });
  const projects = useQuery({ ...projectsQuery({}), enabled: can("projects.view") });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: f.title,
        startsAt: `${f.day}T${f.time}`,
        durationMin: Number(f.durationMin) || 60,
        location: f.location,
        attendeeIds: who,
        clientId: f.clientId,
        requestId: f.requestId,
        projectId: f.projectId,
        agenda: f.agenda,
      };
      if (existing) {
        await send("PATCH", `/api/meetings/${existing.id}`, body);
        return existing.id;
      }
      return (await send<{ id: string }>("POST", "/api/meetings", body)).id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      onSaved(id);
      onClose();
    },
    onError: () => setError("تعذّر الحفظ: تأكد من العنوان والموعد."),
  });
  const open = (reqs.data?.requests ?? []).filter(
    (r) => !r.interest && r.status !== "won" && r.status !== "lost",
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={existing ? "تعديل الاجتماع" : "اجتماع جديد"}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {error && <Notice>{error}</Notice>}
        <Field label="عنوان الاجتماع">
          <Input value={f.title} onChange={set("title")} placeholder="مثلاً: مراجعة خطة الملتقى" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="اليوم">
            <Input type="date" value={f.day} onChange={set("day")} />
          </Field>
          <Field label="الساعة">
            <Input type="time" value={f.time} onChange={set("time")} />
          </Field>
          <Field label="المدة">
            <Select value={f.durationMin} onChange={set("durationMin")}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} دقيقة` : m === 60 ? "ساعة" : `${m / 60} ساعة`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المكان أو الرابط">
            <Input value={f.location} onChange={set("location")} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">الحضور</legend>
          <div className="flex flex-wrap gap-1.5">
            {(people.data ?? []).map((p) => {
              const on = who.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setWho((w) => (on ? w.filter((x) => x !== p.id) : [...w, p.id]))}
                  className={cx(
                    "min-h-9 rounded-full border px-3 text-sm transition",
                    on ? "border-brand bg-brand-soft text-brand" : "text-muted hover:text-ink",
                  )}
                >
                  {p.name || p.email}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          {can("clients.view") && (
            <Field label="مع العميل">
              <Select value={f.clientId} onChange={set("clientId")}>
                <option value="">—</option>
                {(clients.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {can("sales.view") && (
            <Field label="عن الفرصة">
              <Select value={f.requestId} onChange={set("requestId")}>
                <option value="">—</option>
                {open.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.entity || r.name}
                    {r.productName ? ` · ${r.productName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {can("projects.view") && (
            <Field label="عن المشروع">
              <Select value={f.projectId} onChange={set("projectId")}>
                <option value="">—</option>
                {(projects.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="جدول الأعمال">
          <Textarea
            rows={3}
            value={f.agenda}
            onChange={set("agenda")}
            placeholder="بند في كل سطر"
          />
        </Field>
        <Button
          type="submit"
          className="w-full"
          disabled={!f.title.trim() || !f.day || save.isPending}
        >
          {existing ? "حفظ" : "جدولة الاجتماع"}
        </Button>
      </form>
    </Dialog>
  );
}
