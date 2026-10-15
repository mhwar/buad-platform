import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { attentionQuery } from "../../features/home/api";
import { cx } from "../ui";
import { badgeFor, type NavEntry, type NavGroup } from "./nav-model";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

const NO_COUNTS: Record<string, number> = {};

/** Live counts per attention key, from the same feed the home page shows. */
function useAttentionCounts() {
  const q = useQuery(attentionQuery);
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of q.data?.items ?? []) out[i.key] = i.count;
    return q.data ? out : NO_COUNTS;
  }, [q.data]);
}

const SidebarItem = memo(function SidebarItem({
  entry,
  active,
  collapsed,
  badge,
}: {
  entry: NavEntry;
  active: boolean;
  collapsed: boolean;
  badge: number;
}) {
  return (
    <Link
      to={entry.to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? `${entry.label}${badge ? `، ${badge}` : ""}` : undefined}
      title={collapsed ? entry.label : entry.hint}
      className={cx(
        "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-brand-soft font-semibold text-brand"
          : "text-muted hover:bg-brand-soft/60 hover:text-ink",
      )}
    >
      {active && (
        <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand" />
      )}
      <entry.icon className="size-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          {entry.soon && (
            <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-muted dark:bg-slate-800">
              قريباً
            </span>
          )}
          {badge > 0 && (
            <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge > 0 && (
        <span
          aria-hidden
          className="absolute end-2 top-1.5 size-2 rounded-full bg-red-600 ring-2 ring-surface"
        />
      )}
    </Link>
  );
});

function Group({
  group,
  activeKey,
  collapsed,
  counts,
}: {
  group: NavGroup;
  activeKey: string | null;
  collapsed: boolean;
  counts: Record<string, number>;
}) {
  // A collapsible group (the «قريباً» tools) starts folded, unless one of its pages is open.
  const containsActive = group.items.some((i) => i.key === activeKey);
  const [open, setOpen] = useState(!group.collapsible);
  // Folded to icons, the not-yet-built tools stay out of the way unless one is open.
  const shown = !group.collapsible || (collapsed ? containsActive : open || containsActive);
  const id = `nav-${group.key}`;
  return (
    <section aria-labelledby={id} className="space-y-0.5">
      {collapsed ? (
        <hr aria-hidden className="mx-3 my-2 first:hidden" />
      ) : group.collapsible ? (
        <button
          type="button"
          id={id}
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-[11px] font-semibold tracking-wide text-muted hover:text-ink"
        >
          {group.label}
          <ChevronDown className={cx("size-3.5 transition-transform", shown && "rotate-180")} />
        </button>
      ) : (
        <h2 id={id} className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-muted">
          {group.label}
        </h2>
      )}
      {shown && (
        <ul id={`${id}-list`} className="space-y-0.5">
          {group.items.map((e) => (
            <li key={e.key}>
              <SidebarItem
                entry={e}
                active={e.key === activeKey}
                collapsed={collapsed}
                badge={badgeFor(e, counts)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The desktop sidebar: grouped destinations, live badges, foldable to icons. */
export function Sidebar({ groups, activeKey }: { groups: NavGroup[]; activeKey: string | null }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const counts = useAttentionCounts();
  return (
    <aside
      className={cx(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-e bg-surface transition-[width] duration-200 motion-reduce:transition-none lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <nav aria-label="الأقسام" className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
        {groups.map((g) => (
          <Group
            key={g.key}
            group={g}
            activeKey={activeKey}
            collapsed={collapsed}
            counts={counts}
          />
        ))}
      </nav>
      <div className="border-t p-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-pressed={collapsed}
          aria-label={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
          className={cx(
            "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted transition hover:bg-brand-soft/60 hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? (
            <PanelRightOpen className="size-[18px]" />
          ) : (
            <PanelRightClose className="size-[18px]" />
          )}
          {!collapsed && "طيّ القائمة"}
        </button>
      </div>
    </aside>
  );
}
