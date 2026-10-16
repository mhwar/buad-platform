import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { day } from "../../lib/format";
import { useCan } from "../../session";
import { addDaysLocal, MEETING_LABEL, meetingsQuery, timeOf } from "./api";
import { MeetingDialog } from "./MeetingDialog";

type Link_ = { clientId?: string; requestId?: string; projectId?: string };
/** Past meetings kept on the card; the rest are on «الاجتماعات». */
const PAST = 3;

/**
 * The meetings about one client, opportunity or project, on its own page: what is coming, the
 * last few held, and a «اجتماع» button that plans one already linked to it.
 */
export function RecordMeetings({ link, title }: { link: Link_; title?: string }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const q = useQuery({ ...meetingsQuery(link), enabled: can("meetings.view") });
  if (!can("meetings.view")) return null;
  const today = addDaysLocal(0);
  const all = q.data ?? [];
  const coming = all.filter((m) => m.status === "scheduled" && m.startsAt.slice(0, 10) >= today);
  const past = all
    .filter((m) => !coming.includes(m))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, PAST);
  const rows = [...coming, ...past];
  return (
    <Card className="p-4" aria-label="الاجتماعات">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <CalendarDays className="size-4 text-muted" />
          الاجتماعات
        </h2>
        {can("meetings.edit") && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            اجتماع
          </Button>
        )}
      </div>
      {q.isSuccess && rows.length === 0 && (
        <p className="text-sm text-muted">لا اجتماعات مرتبطة بعد.</p>
      )}
      <ul className="divide-y">
        {rows.map((m) => (
          <li key={m.id}>
            <Link
              to="/meetings"
              search={{ open: m.id }}
              className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brand"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.title}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {day(m.startsAt.slice(0, 10))} · {timeOf(m.startsAt)}
                </span>
              </span>
              <Badge tone={coming.includes(m) ? "blue" : m.status === "done" ? "green" : "gray"}>
                {coming.includes(m) ? "قادم" : MEETING_LABEL[m.status]}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
      {open && (
        <MeetingDialog
          seed={{ ...link, title }}
          onClose={() => setOpen(false)}
          onSaved={() => {}}
        />
      )}
    </Card>
  );
}
