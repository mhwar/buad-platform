import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type MeetingStatus = "scheduled" | "done" | "cancelled";
export type Meeting = {
  id: string;
  title: string;
  /** Local «YYYY-MM-DDTHH:MM». */
  startsAt: string;
  durationMin: number;
  location: string;
  attendees: { id: string; name: string }[];
  clientId: string;
  clientName: string;
  requestId: string;
  requestName: string;
  projectId: string;
  projectName: string;
  agenda: string;
  minutes: string;
  status: MeetingStatus;
  createdBy: string;
  createdByName: string;
  openDecisions?: number;
  /** The organiser or a manager: may change and delete it (attendees keep the minutes). */
  canManage?: boolean;
  createdAt: number;
  updatedAt: number;
};
export type DecisionStatus = "open" | "done" | "cancelled";
export type Decision = {
  id: string;
  title: string;
  details: string;
  ownerId: string;
  ownerName: string;
  dueDate: string;
  status: DecisionStatus;
  meetingId: string;
  meetingTitle: string;
  projectId: string;
  taskId: string;
  /** What the viewer may do with it. */
  canEdit?: boolean;
  canClose?: boolean;
  createdAt: number;
  updatedAt: number;
};

export const MEETING_LABEL: Record<MeetingStatus, string> = {
  scheduled: "مجدول",
  done: "عُقد",
  cancelled: "أُلغي",
};
export const DECISION_LABEL: Record<DecisionStatus, string> = {
  open: "مفتوح",
  done: "نُفّذ",
  cancelled: "أُلغي",
};

export type MeetingFilter = {
  from?: string;
  to?: string;
  mine?: "1";
  /** One record's meetings: shown on its client, opportunity or project page. */
  clientId?: string;
  requestId?: string;
  projectId?: string;
};
export const meetingsQuery = (f: MeetingFilter = {}) =>
  queryOptions({
    queryKey: ["meetings", "list", f],
    queryFn: async () => {
      const qs = new URLSearchParams(
        (Object.entries(f) as [string, string | undefined][]).filter(
          (e): e is [string, string] => !!e[1],
        ),
      ).toString();
      return (await ok<{ items: Meeting[] }>(await fetch(`/api/meetings${qs ? `?${qs}` : ""}`)))
        .items;
    },
  });
export const meetingQuery = (id: string) =>
  queryOptions({
    queryKey: ["meetings", "detail", id],
    queryFn: async () =>
      ok<{ meeting: Meeting; decisions: Decision[] }>(await fetch(`/api/meetings/${id}`)),
  });
export type DecisionFilter = { status?: DecisionStatus; mine?: "1" };
export const decisionsQuery = (f: DecisionFilter = {}) =>
  queryOptions({
    queryKey: ["decisions", f],
    queryFn: async () => {
      const qs = new URLSearchParams(
        (Object.entries(f) as [string, string | undefined][]).filter(
          (e): e is [string, string] => !!e[1],
        ),
      ).toString();
      return (await ok<{ items: Decision[] }>(await fetch(`/api/decisions${qs ? `?${qs}` : ""}`)))
        .items;
    },
  });

/** Local date helpers: meetings live in the team's clock, not UTC. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDaysLocal = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
export const timeOf = (startsAt: string) => timeFmt.format(new Date(startsAt));
export const dayOf = (startsAt: string) => dayFmt.format(new Date(startsAt));
