import { z } from "zod";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const text = (max: number) => z.string().trim().max(max);

export const cycleCreate = z.object({
  kind: z.enum(["strategic", "operational"]),
  name: text(120).min(1),
  startDate: date.default(""),
  endDate: date.default(""),
  parentCycleId: z.string().max(60).default(""),
});

export const cyclePatch = z
  .object({
    version: z.number().int().min(1),
    name: text(120).min(1),
    startDate: date,
    endDate: date,
    vision: text(1000),
    mission: text(1000),
    values: z.array(text(80).min(1)).max(12),
    status: z.enum(["draft", "active", "closed"]),
    parentCycleId: z.string().max(60),
  })
  .partial()
  .required({ version: true });

export const objectiveInput = z.object({
  cycleId: z.string().max(60),
  parentId: z.string().max(60).default(""),
  title: text(200).min(1),
  description: text(1000).default(""),
  ownerId: z.string().max(60).default(""),
  quarter: z.number().int().min(0).max(4).default(0),
  weight: z.number().int().min(1).max(10).default(1),
  /** Riyals. */
  budget: z.number().min(0).max(1_000_000_000).default(0),
});
export const objectivePatch = objectiveInput.omit({ cycleId: true }).partial();

export const indicatorInput = z.object({
  name: text(160).min(1),
  unit: text(30).default(""),
  baseline: z.number().default(0),
  target: z.number(),
  current: z.number().default(0),
  source: z
    .string()
    .max(60)
    .regex(/^(manual|platform:[a-z_]+)$/)
    .default("manual"),
  direction: z.enum(["up", "down"]).default("up"),
});
export const indicatorPatch = indicatorInput.partial();

export const initiativeInput = z.object({
  title: text(200).min(1),
  ownerId: z.string().max(60).default(""),
  startDate: date.default(""),
  dueDate: date.default(""),
  budget: z.number().min(0).max(1_000_000_000).default(0),
  status: z.enum(["todo", "doing", "blocked", "done"]).default("todo"),
  projectId: z.string().max(60).default(""),
  productId: z.string().max(60).default(""),
});
export const initiativePatch = initiativeInput.partial();

export const reviewInput = z.object({
  quarter: z.number().int().min(0).max(4).default(0),
  note: text(2000).default(""),
});
