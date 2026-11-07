import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback } from "react";

/**
 * One piece of page state kept in the address (a tab, a filter, a period), so reloading, sharing a
 * link or going back lands on the same view. The default value is left out of the URL.
 * Works on any route: it reads the raw search, so the route needs no schema for it.
 */
export function useSearchParam<T extends string = string>(
  key: string,
  fallback: NoInfer<T>,
): [T, (v: T) => void] {
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const raw = search[key];
  const navigate = useNavigate();
  // The router may read ?q=1 as a number: compare and hand back strings.
  const value = raw === undefined || raw === null || raw === "" ? fallback : (String(raw) as T);
  const set = useCallback(
    // Returns nothing (like a state setter), so it is safe as an effect's one-line body.
    (next: T) => {
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          [key]: next === fallback || next === "" ? undefined : next,
        }),
        replace: true,
      } as never);
    },
    [navigate, key, fallback],
  );
  return [value, set];
}
