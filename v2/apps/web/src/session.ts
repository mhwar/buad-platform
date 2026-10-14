import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Me = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  roleKey: string;
  perms: string[];
  scopes: Record<string, string>;
};

/** The current user, or null when signed out. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    const res = await api.api.me.$get();
    if (res.status === 401) return null;
    const body = await res.json();
    return "user" in body ? (body.user as Me) : null;
  },
  staleTime: 60_000,
  retry: false,
});

/** True only while the one-time first-owner setup is available. */
export const setupStatusQuery = queryOptions({
  queryKey: ["setup-status"],
  queryFn: async (): Promise<boolean> => {
    const res = await api.api.setup.status.$get();
    if (!res.ok) return false;
    return (await res.json()).needsSetup === true;
  },
  staleTime: 30_000,
  retry: false,
});

/** `can("finance.edit")`: whether the signed-in person's role grants it (false while loading). */
export function useCan() {
  const perms = useQuery(meQuery).data?.perms;
  return (perm: string) => !!perms?.includes(perm);
}
