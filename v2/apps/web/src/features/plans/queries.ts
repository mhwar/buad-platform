import type { PlanStatus } from "@buad/domain";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type Cycle = {
  id: string;
  kind: "strategic" | "operational";
  name: string;
  startDate: string;
  endDate: string;
  vision: string;
  mission: string;
  values: string[];
  parentCycleId: string;
  status: "draft" | "active" | "closed";
  version: number;
};
export type Indicator = {
  id: string;
  name: string;
  unit: string;
  baseline: number;
  target: number;
  /** null when it is money the viewer may not see (the share reached still shows). */
  current: number | null;
  hidden?: boolean;
  source: string;
  direction: "up" | "down";
  attainment: number;
};
export type Initiative = {
  id: string;
  title: string;
  ownerId: string;
  startDate: string;
  dueDate: string;
  budget: number;
  status: "todo" | "doing" | "blocked" | "done";
  /** Tasks filed under it. */
  tasks?: { total: number; done: number };
};
export type Review = {
  id: string;
  quarter: number;
  note: string;
  createdAt: number;
  snapshot: { progress: number | null };
};
export type Objective = {
  id: string;
  cycleId: string;
  parentId: string;
  title: string;
  description: string;
  ownerId: string;
  quarter: number;
  weight: number;
  budget: number;
  indicators: Indicator[];
  initiatives: Initiative[];
  reviews: Review[];
  progress: number | null;
  status: PlanStatus;
};
export type CycleData = {
  cycle: Cycle;
  objectives: Objective[];
  progress: number | null;
  status: PlanStatus;
  budget: number;
};

export const cyclesQuery = queryOptions({
  queryKey: ["plan-cycles"],
  queryFn: async () => (await ok<{ cycles: Cycle[] }>(await fetch("/api/plans/cycles"))).cycles,
});
export const cycleQuery = (id: string) =>
  queryOptions({
    queryKey: ["plan-cycle", id],
    queryFn: async () => ok<CycleData>(await fetch(`/api/plans/cycles/${id}`)),
    enabled: !!id,
  });
export const ownersQuery = queryOptions({
  queryKey: ["plan-owners"],
  queryFn: async () =>
    (
      await ok<{ owners: { id: string; name: string; email: string }[] }>(
        await fetch("/api/plans/owners"),
      )
    ).owners,
  staleTime: 5 * 60_000,
});

export type PlanTemplateInfo = {
  key: string;
  name: string;
  description: string;
  objectives: string[];
  quarters: string[];
  usedYears: number[];
};
export const templatesQuery = queryOptions({
  queryKey: ["plan-templates"],
  queryFn: async () =>
    (await ok<{ templates: PlanTemplateInfo[] }>(await fetch("/api/plans/templates"))).templates,
});
export type Series = {
  indicator: { id: string; name: string; unit: string; target: number };
  window: { start: string; end: string };
  months: { month: string; value: number; cumulative: number; future: boolean }[];
  pace: {
    share: number;
    expected: number;
    projected: number;
    gap: number;
    perMonthNeeded: number;
    ahead: boolean;
  };
};
export const seriesQuery = (id: string) =>
  queryOptions({
    queryKey: ["plan-cycle", "series", id],
    queryFn: async () => ok<Series>(await fetch(`/api/plans/indicators/${id}/series`)),
    enabled: !!id,
  });
