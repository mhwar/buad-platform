import { z } from "zod";
import { patchOf } from "./patch";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
/** Local date and time as typed: «2026-10-15T10:30». */
const when = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const MEETING_STATUSES = ["scheduled", "done", "cancelled"] as const;
const meetingShape = {
  title: z.string().trim().min(1).max(200),
  startsAt: when,
  durationMin: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
  location: z.string().trim().max(300).default(""),
  attendeeIds: z.array(z.string().max(60)).max(40).default([]),
  /** Optional links: who it was with, and what it was about. */
  clientId: z.string().max(60).default(""),
  requestId: z.string().max(60).default(""),
  projectId: z.string().max(60).default(""),
  agenda: z.string().trim().max(4000).default(""),
  minutes: z.string().trim().max(20000).default(""),
  status: z.enum(MEETING_STATUSES).default("scheduled"),
};
export const meetingInput = z.object(meetingShape);
export const meetingPatch = patchOf(meetingShape);
export const meetingQuery = z.object({
  from: date.optional(),
  to: date.optional(),
  mine: z.enum(["1"]).optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  /** The meetings about one record: its client, opportunity or project page. */
  clientId: z.string().max(60).optional(),
  requestId: z.string().max(60).optional(),
  projectId: z.string().max(60).optional(),
});

export const DECISION_STATUSES = ["open", "done", "cancelled"] as const;
const decisionShape = {
  title: z.string().trim().min(1).max(300),
  details: z.string().trim().max(4000).default(""),
  ownerId: z.string().max(60).default(""),
  dueDate: date.default(""),
  status: z.enum(DECISION_STATUSES).default("open"),
  meetingId: z.string().max(60).default(""),
  projectId: z.string().max(60).default(""),
};
export const decisionInput = z.object(decisionShape);
export const decisionPatch = patchOf(decisionShape);
export const decisionQuery = z.object({
  status: z.enum(DECISION_STATUSES).optional(),
  mine: z.enum(["1"]).optional(),
  meeting: z.string().max(60).optional(),
});
