import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type AttentionItem = {
  key: string;
  tone: "warn" | "info";
  title: string;
  count: number;
  link: string;
};
export type ChecklistItem = { key: string; label: string; done: boolean; link: string };
export const attentionQuery = queryOptions({
  queryKey: ["attention"],
  queryFn: async () =>
    ok<{ items: AttentionItem[]; checklist: ChecklistItem[] }>(await fetch("/api/attention")),
  staleTime: 30_000,
});

export type Notice = {
  id: string;
  kind: string;
  title: string;
  link: string;
  readAt: number;
  createdAt: number;
};
export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async () => ok<{ items: Notice[]; unread: number }>(await fetch("/api/notifications")),
  refetchInterval: 60_000,
  staleTime: 20_000,
});
