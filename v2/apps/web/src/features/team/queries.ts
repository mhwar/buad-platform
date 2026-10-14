import type { RoleDef } from "@buad/domain";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type TeamUser = {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  active: boolean;
  pending: boolean;
  lastLoginAt: number;
  createdAt: number;
};
export type TeamRole = RoleDef & { builtin: boolean; edited: boolean; users: number };

export const teamUsersQuery = queryOptions({
  queryKey: ["team-users"],
  queryFn: async () => (await ok<{ users: TeamUser[] }>(await fetch("/api/team/users"))).users,
});
export const teamRolesQuery = queryOptions({
  queryKey: ["team-roles"],
  queryFn: async () => (await ok<{ roles: TeamRole[] }>(await fetch("/api/team/roles"))).roles,
});

export type AuditItem = {
  id: string;
  at: number;
  userId: string;
  userName: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  detail: Record<string, unknown>;
};
export const auditQuery = (q: { entity?: string; user?: string; from?: string; to?: string }) =>
  queryOptions({
    queryKey: ["audit", q],
    queryFn: async () => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
      return (await ok<{ items: AuditItem[] }>(await fetch(`/api/audit?${p}`))).items;
    },
  });

export const send = async <T = { ok: true }>(method: string, url: string, body?: unknown) =>
  ok<T>(
    await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
