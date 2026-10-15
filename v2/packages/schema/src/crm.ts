import { z } from "zod";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const activityInput = z.object({
  type: z.enum(["call", "meeting", "visit", "email", "whatsapp", "note"]),
  summary: z.string().trim().min(1).max(1000),
  /** The day it happened; today when omitted. */
  on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  requestId: z.string().max(60).default(""),
  /** Next follow-up: a date sets it, "" clears it, absent leaves it alone. */
  followUpAt: date.optional(),
});

export const crmPatch = z.object({
  ownerId: z.string().max(60).optional(),
  source: z.enum(["", "site", "referral", "event", "call", "social", "other"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  nextFollowUpAt: date.optional(),
});

export const followupQuery = z.object({
  scope: z.enum(["mine", "all"]).default("all"),
});
