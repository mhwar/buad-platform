import { z } from "zod";
import { patchOf } from "./patch";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
const taskShape = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  projectId: z.string().max(60).default(""),
  stageId: z.string().max(60).default(""),
  initiativeId: z.string().max(60).default(""),
  assigneeId: z.string().max(60).default(""),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  startDate: date.default(""),
  dueDate: date.default(""),
};
export const taskInput = z.object(taskShape);
export const taskPatch = patchOf(taskShape);

const stageShape = {
  title: z.string().trim().min(1).max(160),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  dueDate: date.default(""),
};
export const stageInput = z.object(stageShape);
export const stagePatch = patchOf(stageShape);

export const timeInput = z.object({
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).default(""),
});

export const taskQuery = z.object({
  mine: z.enum(["1"]).optional(),
  project: z.string().max(60).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  assignee: z.string().max(60).optional(),
  overdue: z.enum(["1"]).optional(),
});
