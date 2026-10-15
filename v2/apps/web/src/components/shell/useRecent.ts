import { useEffect, useSyncExternalStore } from "react";

/** Something the person opened: shown under «الأخيرة» in the sidebar. */
export type RecentItem = {
  kind: "client" | "project" | "opportunity" | "document" | "meeting";
  id: string;
  title: string;
  href: string;
};
const KEY = "buad-recent";
const MAX = 5;
const listeners = new Set<() => void>();
let cache: RecentItem[] | null = null;

const read = (): RecentItem[] => {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? (v as RecentItem[]).slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
};

/** Puts an item first, without duplicates, keeping the five most recent. */
export function trackRecent(item: RecentItem) {
  const next = [item, ...read().filter((x) => !(x.kind === item.kind && x.id === item.id))].slice(
    0,
    MAX,
  );
  const same = JSON.stringify(next) === JSON.stringify(read());
  if (same) return;
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // remembered for this visit only
  }
  for (const l of listeners) l();
}

/** Drops an item that no longer exists (deleted or no longer visible). */
export function forgetRecent(kind: RecentItem["kind"], id: string) {
  cache = read().filter((x) => !(x.kind === kind && x.id === id));
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};
const EMPTY: RecentItem[] = [];

export function useRecent(): RecentItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Call from a record's page once its title is known. */
export function useTrackRecent(item: RecentItem | null) {
  const key = item ? `${item.kind}:${item.id}:${item.title}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key captures the item
  useEffect(() => {
    if (item) trackRecent(item);
  }, [key]);
}

/** For tests. */
export const _resetRecent = () => {
  cache = null;
};
