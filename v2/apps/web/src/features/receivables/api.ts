import type { AgingKey } from "@buad/domain";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type Instalment = {
  id: string;
  projectId: string;
  label: string;
  dueDate: string;
  amount: number;
  status: "pending" | "received" | "cancelled";
  receivedAt: string;
};
export type OwedItem = Instalment & { project: string; client: string; phone: string };
export type Week = {
  start: string;
  end: string;
  inflow: number;
  outflow: number;
  net: number;
  balance: number;
};
export type Receivables = {
  today: string;
  aging: {
    total: number;
    overdue: number;
    buckets: Record<AgingKey, { amount: number; count: number }>;
  };
  items: OwedItem[];
  weeks: Week[];
  shortfallWeek: string | null;
  pendingExpenses: number;
};
export const receivablesQuery = (opening: number) =>
  queryOptions({
    queryKey: ["receivables", opening],
    queryFn: async () => ok<Receivables>(await fetch(`/api/receivables?opening=${opening}`)),
  });
export const scheduleQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["schedule", projectId],
    queryFn: async () =>
      (await ok<{ items: Instalment[] }>(await fetch(`/api/receivables/projects/${projectId}`)))
        .items,
  });
