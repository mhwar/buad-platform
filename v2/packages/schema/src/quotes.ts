import { z } from "zod";
import { patchOf } from "./patch";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const quoteItem = z.object({
  label: z.string().trim().min(1).max(200),
  qty: z.number().min(0).max(1_000_000),
  /** Riyals. */
  unit: z.number().min(0).max(1_000_000_000),
});

const quoteShape = {
  requestId: z.string().max(60).default(""),
  clientId: z.string().max(60).default(""),
  productId: z.string().max(60).default(""),
  packageId: z.string().max(60).default(""),
  recipient: z.string().trim().max(160).default(""),
  entity: z.string().trim().max(160).default(""),
  title: z.string().trim().min(1).max(200),
  items: z.array(quoteItem).max(40).default([]),
  /** Riyals. */
  discount: z.number().min(0).max(1_000_000_000).default(0),
  vatPct: z.number().min(0).max(100).default(15),
  validUntil: date.default(""),
  terms: z.string().trim().max(3000).default(""),
};
export const quoteInput = z.object(quoteShape);
export const quotePatch = patchOf(quoteShape).extend({ version: z.number().int().min(1) });
export const quoteConvertInput = z.object({
  schedule: z.enum(["full", "half", "thirds", "none"]).default("half"),
  /** Use an existing client instead of creating one. */
  clientId: z.string().max(60).optional(),
  confirmSimilarName: z.boolean().default(false),
  projectName: z.string().trim().max(200).optional(),
});
export const quoteStatusInput = z.object({ to: z.enum(["draft", "sent", "accepted", "rejected"]) });
