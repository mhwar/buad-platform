import { z } from "zod";
import { patchOf } from "./patch";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shape = {
  label: z.string().trim().min(1).max(120),
  dueDate: date,
  /** Riyals, gross. */
  amount: z.number().positive().max(1_000_000_000),
};
export const scheduleInput = z.object(shape);
export const schedulePatch = patchOf(shape).extend({
  status: z.enum(["pending", "cancelled"]).optional(),
});
export const receiveInput = z.object({
  date: date.optional(),
  /** Riyals. Less than the line: a partial payment, and the rest stays as a new pending line. */
  amount: z.number().positive().max(1_000_000_000).optional(),
});
