import { Briefcase, House, Landmark, Menu, Users } from "lucide-react";
import type { ComponentType } from "react";
import { GROUPS, inHub, MORE_TABS, type MoreTab } from "../../features/more/tabs";

/** One destination in the app's navigation (sidebar, palette, phone bar). */
export type NavEntry = {
  key: string;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** Highlighted for this exact path only (the home page). */
  exact?: boolean;
  soon?: boolean;
  /** `/api/attention` keys whose counts form this entry's badge. */
  attention: readonly string[];
  /** One sentence for tooltips and the palette. */
  hint: string;
  /** True when the entry is the one for `path`. */
  match: (path: string) => boolean;
};
export type NavGroup = { key: string; label: string; items: NavEntry[]; collapsible?: boolean };

const prefix = (to: string) => (p: string) => p === to || p.startsWith(`${to}/`);

/** The four sections everyone starts from. «المالية» needs the treasury permission. */
const CORE: (NavEntry & { perm?: string })[] = [
  {
    key: "home",
    label: "الرئيسية",
    to: "/",
    icon: House,
    exact: true,
    attention: [],
    hint: "ملخص يومك",
    match: (p) => p === "/",
  },
  {
    key: "clients",
    label: "العملاء",
    to: "/clients",
    icon: Users,
    attention: [],
    hint: "ملفات العملاء وكشوف حساباتهم",
    match: prefix("/clients"),
  },
  {
    key: "projects",
    label: "المشاريع",
    to: "/projects",
    icon: Briefcase,
    attention: ["overdue"],
    hint: "المشاريع وماليتها وتنفيذها",
    match: prefix("/projects"),
  },
  {
    key: "finance",
    label: "المالية",
    to: "/finance",
    icon: Landmark,
    attention: [],
    hint: "مالية الجهة والشركاء والضريبة",
    match: prefix("/finance"),
    perm: "treasury.view",
  },
];

const fromTab = (t: MoreTab): NavEntry => ({
  key: t.key,
  label: t.label,
  to: t.to,
  icon: t.icon,
  soon: t.soon,
  attention: t.attention ?? [],
  hint: t.desc,
  match: t.match,
});

/** Sidebar groups for someone with `perms`: everything comes from the one registry, nothing is repeated. */
export function buildNav(perms: readonly string[]): NavGroup[] {
  const can = (perm?: string) => !perm || perms.includes(perm);
  const groups: NavGroup[] = [
    {
      key: "main",
      label: "الأساسي",
      items: CORE.filter((c) => can(c.perm)).map(({ perm: _p, ...e }) => e),
    },
  ];
  for (const g of ["work", "company", "admin", "soon"] as const) {
    const items = MORE_TABS.filter((t) => t.group === g && can(t.perm)).map(fromTab);
    if (items.length) groups.push({ key: g, label: GROUPS[g], items, collapsible: g === "soon" });
  }
  return groups;
}

/** The entry the current path belongs to, preferring the most specific one. */
export function activeEntry(groups: NavGroup[], path: string): NavEntry | null {
  let best: NavEntry | null = null;
  for (const g of groups)
    for (const e of g.items) if (e.match(path) && (!best || e.to.length > best.to.length)) best = e;
  return best;
}

/** Badge total for an entry from the attention counts. */
export const badgeFor = (e: NavEntry, counts: Readonly<Record<string, number>>) =>
  e.attention.reduce((s, k) => s + (counts[k] ?? 0), 0);

/** The five items of the phone's bottom bar. */
export type PhoneNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
  also?: (path: string) => boolean;
};
export function phoneNav(perms: readonly string[]): PhoneNavItem[] {
  const core = CORE.filter((c) => !c.perm || perms.includes(c.perm)).map((c) => ({
    to: c.to,
    label: c.label,
    icon: c.icon,
    exact: !!c.exact,
  }));
  return [...core, { to: "/more", label: "المزيد", icon: Menu, exact: false, also: inHub }];
}
