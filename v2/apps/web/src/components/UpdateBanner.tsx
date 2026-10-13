import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../api";

/** The commit this page was built from; "" in local development. */
export const BUILD_VERSION = (import.meta.env.VITE_APP_VERSION ?? "").slice(0, 7);

/**
 * A single-page app keeps running old code until reloaded. The server reports the deployed
 * version; when it differs from this bundle's, offer a one-click update.
 */
export function useServerVersion() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => (await api.api.health.$get()).json(),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function UpdateBanner() {
  const health = useServerVersion();
  const server = health.data?.version ?? "";
  if (!BUILD_VERSION || !server || server === "0.0.0" || server === BUILD_VERSION) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-brand px-4 py-2 text-sm text-white dark:text-canvas"
    >
      <span>صدرت نسخة جديدة من المنصة.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25"
      >
        <RefreshCw className="size-3.5" /> تحديث الآن
      </button>
    </div>
  );
}
