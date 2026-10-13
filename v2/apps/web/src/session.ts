import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

export type Me = { id: string; orgId: string; email: string; name: string; role: string };

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
