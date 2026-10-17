import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTrackRecent } from "../../components/shell/useRecent";
import {
  Badge,
  Button,
  Card,
  confirmAction,
  cx,
  Dialog,
  EmptyState,
  Field,
  Notice,
  PageHeader,
  Segmented,
  Textarea,
} from "../../components/ui";
import { meQuery, useCan } from "../../session";
import { send } from "../team/queries";
import {
  addDaysLocal,
  dayOf,
  localDay,
  MEETING_LABEL,
  type Meeting,
  meetingQuery,
  meetingsQuery,
  timeOf,
} from "./api";
import { DecisionDialog } from "./DecisionDialog";
import { DecisionList } from "./DecisionList";
import { MeetingDialog } from "./MeetingDialog";

const route = getRouteApi("/meetings");
type Range = "upcoming" | "past";

/**
 * «الاجتماعات»: the coming ones grouped by day (today first), the past ones with their minutes.
 * A meeting opens into its card: agenda, minutes, decisions — and «عُقد» to close it.
 */
export function MeetingsPage() {
  const s = route.useSearch();
  const nav = route.useNavigate();
  const can = useCan();
  const [range, setRange] = useState<Range>("upcoming");
  const [mine, setMine] = useState(false);
  const [adding, setAdding] = useState(false);
  const t = localDay();
  const q = useQuery(
    meetingsQuery(
      range === "upcoming"
        ? { from: t, mine: mine ? "1" : undefined }
        : { to: addDaysLocal(-1), mine: mine ? "1" : undefined },
    ),
  );
  const items = range === "past" ? [...(q.data ?? [])].reverse() : (q.data ?? []);
  const groups = new Map<string, Meeting[]>();
  for (const m of items) {
    const k = m.startsAt.slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const heading = (d: string) =>
    d === t
      ? "اليوم"
      : d === addDaysLocal(1)
        ? "غداً"
        : d === addDaysLocal(-1)
          ? "أمس"
          : dayOf(`${d}T12:00`);
  const open = (id?: string) => nav({ search: id ? { open: id } : {}, replace: true });

  return (
    <>
      <PageHeader
        title="الاجتماعات"
        subtitle="المواعيد والحضور والمحاضر، وما خرج منها من قرارات"
        actions={
          can("meetings.edit") && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> اجتماع
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<Range>
          label="الفترة"
          value={range}
          onChange={setRange}
          items={[
            { value: "upcoming", label: "القادمة", icon: <CalendarDays className="size-4" /> },
            { value: "past", label: "السابقة", icon: <Clock className="size-4" /> },
          ]}
        />
        <label className="inline-flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          اجتماعاتي فقط
        </label>
      </div>
      {q.isPending ? (
        <Card className="h-32 animate-pulse" aria-busy />
      ) : items.length === 0 ? (
        <EmptyState
          title={range === "upcoming" ? "لا اجتماعات قادمة" : "لا اجتماعات سابقة"}
          text="جدول اجتماعاً مع فريقك أو عميلك، ودوّن محضره وقراراته بعده."
        />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([d, ms]) => (
            <section key={d} aria-label={heading(d)}>
              <h2
                className={cx("mb-2 text-sm font-semibold", d === t ? "text-brand" : "text-muted")}
              >
                {heading(d)}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {ms.map((m) => (
                  <li key={m.id}>
                    <MeetingCard m={m} onOpen={() => open(m.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {adding && <MeetingDialog onClose={() => setAdding(false)} onSaved={(id) => open(id)} />}
      {s.open && <MeetingDetail id={s.open} onClose={() => open()} />}
    </>
  );
}

export function MeetingCard({ m, onOpen }: { m: Meeting; onOpen: () => void }) {
  return (
    <Card className="relative space-y-1.5 p-4 transition hover:border-brand">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-start font-semibold after:absolute after:inset-0 after:rounded-2xl"
        >
          {m.title}
        </button>
        {m.status !== "scheduled" && (
          <Badge tone={m.status === "done" ? "green" : "gray"}>{MEETING_LABEL[m.status]}</Badge>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-ink">
          <Clock className="size-3.5" />
          {timeOf(m.startsAt)}
        </span>
        {m.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {m.location}
          </span>
        )}
        {m.attendees.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {m.attendees.length}
          </span>
        )}
      </p>
      {(m.clientName || m.requestName || m.projectName) && (
        <p className="text-xs text-muted">
          {[
            m.clientName,
            m.requestName && `فرصة: ${m.requestName}`,
            m.projectName && `مشروع: ${m.projectName}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {!!m.openDecisions && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {m.openDecisions} قرار مفتوح
        </p>
      )}
    </Card>
  );
}

/** One meeting: what, when, who; its agenda, minutes and decisions; and closing it. */
function MeetingDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const can = useCan();
  const edit = can("meetings.edit");
  const qc = useQueryClient();
  const q = useQuery(meetingQuery(id));
  const [minutes, setMinutes] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState("");
  const m = q.data?.meeting;
  const me = useQuery(meQuery).data;
  const manage = edit && !!m?.canManage;
  // Attendees keep the minutes and close it; everything else is the organiser's.
  const attend = edit && (manage || !!m?.attendees.some((a) => a.id === me?.id));
  useTrackRecent(m ? { kind: "meeting", id, title: m.title, href: `/meetings?open=${id}` } : null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["meetings"] });
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["crm"] });
  };
  const patch = async (body: object) => {
    setError("");
    try {
      await send("PATCH", `/api/meetings/${id}`, body);
      refresh();
    } catch {
      setError("تعذّر الحفظ");
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={m?.title ?? "الاجتماع"} wide>
      {!m ? (
        q.isError ? (
          <Notice>الاجتماع غير موجود</Notice>
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        )
      ) : (
        <div className="space-y-5">
          {error && <Notice>{error}</Notice>}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CalendarDays className="size-4 text-muted" />
                {dayOf(m.startsAt)} · {timeOf(m.startsAt)} · {m.durationMin} دقيقة
              </p>
              {m.location && (
                <p className="flex items-center gap-2 text-muted">
                  <MapPin className="size-4" />
                  {m.location}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-2 text-muted">
                <Users className="size-4" />
                {m.attendees.length ? m.attendees.map((a) => a.name).join("، ") : "بلا حضور محددين"}
              </p>
              <p className="flex flex-wrap gap-3">
                {m.clientId && (
                  <Link
                    to="/clients/$id"
                    params={{ id: m.clientId }}
                    className="text-brand hover:underline"
                  >
                    {m.clientName}
                  </Link>
                )}
                {m.requestId && (
                  <Link
                    to="/sales/$id"
                    params={{ id: m.requestId }}
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    <ShoppingCart className="size-3.5" />
                    {m.requestName || "الفرصة"}
                  </Link>
                )}
                {m.projectId && (
                  <Link
                    to="/projects/$id"
                    params={{ id: m.projectId }}
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    <Briefcase className="size-3.5" />
                    {m.projectName || "المشروع"}
                  </Link>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={m.status === "done" ? "green" : m.status === "cancelled" ? "gray" : "blue"}
              >
                {MEETING_LABEL[m.status]}
              </Badge>
              {attend && m.status === "scheduled" && (
                <>
                  <Button
                    onClick={() =>
                      patch({ status: "done", ...(minutes !== null ? { minutes } : {}) })
                    }
                  >
                    <Check className="size-4" />
                    عُقد
                  </Button>
                  <Button variant="ghost" onClick={() => patch({ status: "cancelled" })}>
                    <XCircle className="size-4" />
                    إلغاء
                  </Button>
                </>
              )}
              {manage && (
                <>
                  <Button
                    variant="ghost"
                    aria-label="تعديل الاجتماع"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="حذف الاجتماع"
                    onClick={async () => {
                      if (
                        !(await confirmAction({
                          title: "حذف الاجتماع؟",
                          text: "تبقى قراراته.",
                          action: "حذف الاجتماع",
                          danger: true,
                        }))
                      )
                        return;
                      await send("DELETE", `/api/meetings/${id}`);
                      refresh();
                      onClose();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
          {m.agenda && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">جدول الأعمال</h3>
              <ol className="list-inside list-decimal space-y-0.5 rounded-xl bg-canvas/60 p-3 text-sm">
                {m.agenda
                  .split("\n")
                  .filter(Boolean)
                  .map((l, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines of plain text
                    <li key={i}>{l}</li>
                  ))}
              </ol>
            </div>
          )}
          <Field label="المحضر">
            <Textarea
              rows={5}
              disabled={!attend}
              value={minutes ?? m.minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onBlur={() => minutes !== null && minutes !== m.minutes && patch({ minutes })}
              placeholder="ما نوقش وما اتُّفق عليه"
            />
          </Field>
          {m.status === "done" && (m.clientId || m.requestId) && (
            <p className="text-xs text-muted">سُجّل هذا الاجتماع في سجل تواصل العميل.</p>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">القرارات ({q.data?.decisions.length ?? 0})</h3>
              {edit && (
                <Button variant="secondary" onClick={() => setDeciding(true)}>
                  <Plus className="size-4" /> قرار
                </Button>
              )}
            </div>
            {q.data?.decisions.length ? (
              <DecisionList items={q.data.decisions} showMeeting={false} />
            ) : (
              <p className="text-sm text-muted">لم تُسجّل قرارات لهذا الاجتماع.</p>
            )}
          </div>
        </div>
      )}
      {editing && m && (
        <MeetingDialog existing={m} onClose={() => setEditing(false)} onSaved={refresh} />
      )}
      {deciding && <DecisionDialog meetingId={id} onClose={() => setDeciding(false)} />}
    </Dialog>
  );
}
