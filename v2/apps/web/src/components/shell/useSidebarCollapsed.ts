import { useCallback, useSyncExternalStore } from "react";

const KEY = "buad-sidebar-collapsed";
const listeners = new Set<() => void>();

const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
// In memory too: when storage is blocked the choice still holds for this visit.
let memory: boolean | null = null;
const snapshot = () => memory ?? read();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memory = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

/** Whether the sidebar is folded to icons. Saved per browser, shared across tabs, no flash on load. */
export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  const set = useCallback((value: boolean) => {
    memory = value;
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      // blocked storage: remembered in memory only
    }
    for (const l of listeners) l();
  }, []);
  return [collapsed, set] as const;
}

/** For tests: forget the in-memory choice. */
export const _resetSidebarMemory = () => {
  memory = null;
};
