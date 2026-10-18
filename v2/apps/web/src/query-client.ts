import { QueryClient } from "@tanstack/react-query";

// Data a page just showed is reused for 30 seconds when another page asks for it (switching
// tabs, opening a dialog) instead of waiting on the network again; writes invalidate it.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
