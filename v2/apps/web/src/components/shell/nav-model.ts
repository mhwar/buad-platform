import { Menu } from "lucide-react";
import type { ComponentType } from "react";
import {
  isMorePath,
  LOWER_SECTIONS,
  type NavSearch,
  PHONE_CORE,
  type Section,
  type Tint,
  tabHref,
  visibleSections,
} from "../../features/more/tabs";

/** One destination in the app's navigation (sidebar, palette, phone bar). */
export type NavEntry = {
  key: string;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  tint: Tint;
  /** Highlighted for this exact path only (the home page). */
  exact?: boolean;
  /** `/api/attention` keys whose counts form this entry's badge (its tabs' included). */
  attention: readonly string[];
  /** One sentence for tooltips and the palette. */
  hint: string;
  /** The pages inside it: the drop-down under it in the sidebar, and results in the palette. */
  tabs: NavChild[];
  /** True when the path belongs to this section. */
  match: (path: string) => boolean;
};
export type NavChild = {
  key: string;
  label: string;
  /** Path and full URL (query included). */
  to: string;
  href: string;
  desc: string;
  attention: readonly string[];
  match: (path: string, search?: NavSearch) => boolean;
};
/** A block of the sidebar; the lower one (settings, coming soon) is set apart by a divider. */
export type NavGroup = { key: string; items: NavEntry[] };

const entryOf = (s: Section): NavEntry => ({
  key: s.key,
  label: s.label,
  to: s.to,
  icon: s.icon,
  tint: s.tint ?? "slate",
  exact: s.key === "home",
  attention: [
    ...new Set([...(s.attention ?? []), ...(s.tabs ?? []).flatMap((t) => t.attention ?? [])]),
  ],
  hint: s.hint,
  tabs: (s.tabs ?? []).map((t) => ({
    key: t.key,
    label: t.label,
    to: t.to,
    href: tabHref(t),
    desc: t.desc,
    attention: t.attention ?? [],
    match: t.match,
  })),
  match: s.match,
});

/** Sidebar blocks for someone with `perms`. One registry feeds everything; nothing is repeated. */
export function buildNav(perms: readonly string[]): NavGroup[] {
  const sections = visibleSections(perms).map(entryOf);
  const lower = sections.filter((s) => (LOWER_SECTIONS as readonly string[]).includes(s.key));
  const upper = sections.filter((s) => !(LOWER_SECTIONS as readonly string[]).includes(s.key));
  return [
    { key: "main", items: upper },
    { key: "lower", items: lower },
  ].filter((g) => g.items.length > 0);
}

/** The entry the current path belongs to. */
export function activeEntry(groups: NavGroup[], path: string): NavEntry | null {
  let best: NavEntry | null = null;
  for (const g of groups)
    for (const e of g.items) if (e.match(path) && (!best || e.to.length > best.to.length)) best = e;
  return best;
}

/** The child of an entry that the current URL is, if any. */
export const activeChild = (e: NavEntry, path: string, search?: NavSearch) =>
  e.tabs.find((t) => t.match(path, search)) ?? null;

/** Badge total for an entry from the attention counts. */
export const badgeFor = (
  e: { attention: readonly string[] },
  counts: Readonly<Record<string, number>>,
) => e.attention.reduce((s, k) => s + (counts[k] ?? 0), 0);

/** The items of the phone's bottom bar: the core sections plus «المزيد». */
export type PhoneNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
  also?: (path: string) => boolean;
};
export function phoneNav(perms: readonly string[]): PhoneNavItem[] {
  const core = visibleSections(perms)
    .filter((s) => (PHONE_CORE as readonly string[]).includes(s.key))
    .map((s) => ({
      to: s.to,
      label: s.short ?? s.label,
      icon: s.icon,
      exact: s.key === "home",
      also: s.match,
    }));
  return [...core, { to: "/more", label: "المزيد", icon: Menu, exact: false, also: isMorePath }];
}

/** Sections the phone's «المزيد» page lists. */
export const moreSections = (perms: readonly string[]): NavEntry[] =>
  visibleSections(perms)
    .filter((s) => !(PHONE_CORE as readonly string[]).includes(s.key) && s.key !== "home")
    .map(entryOf);
