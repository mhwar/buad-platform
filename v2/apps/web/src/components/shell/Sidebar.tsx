import * as RMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { attentionQuery } from "../../features/home/api";
import type { NavSearch } from "../../features/more/tabs";
import { cx } from "../ui";
import { activeChild, badgeFor, type NavEntry, type NavGroup } from "./nav-model";
import { UserMenu } from "./UserMenu";
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

const Count = ({ n }: { n: number }) =>
  n > 0 ? (
    <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
      {n > 99 ? "99+" : n}
    </span>
  ) : null;

const row =
  "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors";
const tone = (active: boolean) =>
  active
    ? "bg-brand-soft font-semibold text-brand"
    : "text-muted hover:bg-brand-soft/60 hover:text-ink";

/** One section. With pages inside, it opens as a drop-down; folded to icons, as a small menu. */
function Item({
  entry,
  active,
  collapsed,
  counts,
  path,
  search,
}: {
  entry: NavEntry;
  active: boolean;
  collapsed: boolean;
  counts: Record<string, number>;
  path: string;
  search: NavSearch;
}) {
  const navigate = useNavigate();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const badge = badgeFor(entry, counts);
  const hasChildren = entry.tabs.length > 1;
  // Open by default while it is the current section; a click overrides until the next section.
  const open = hasChildren && !collapsed && (toggled ?? active);
  const child = activeChild(entry, path, search);
  const listId = `nav-${entry.key}-pages`;

  const bar = active && (
    <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand" />
  );

  if (collapsed && hasChildren)
    return (
      <RMenu.Root dir="rtl">
        <RMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`${entry.label}${badge ? `، ${badge}` : ""}`}
            title={entry.label}
            className={cx(row, "w-full justify-center px-0", tone(active))}
          >
            {bar}
            <entry.icon className="size-[18px]" />
            {badge > 0 && (
              <span
                aria-hidden
                className="absolute end-2 top-1.5 size-2 rounded-full bg-red-600 ring-2 ring-surface"
              />
            )}
          </button>
        </RMenu.Trigger>
        <RMenu.Portal>
          <RMenu.Content
            side="left"
            align="start"
            sideOffset={8}
            className="z-50 min-w-52 rounded-xl border bg-surface p-1 shadow-lg"
          >
            <RMenu.Label className="px-3 py-1.5 text-[11px] font-semibold text-muted">
              {entry.label}
            </RMenu.Label>
            {entry.tabs.map((t) => (
              <RMenu.Item
                key={t.key}
                onSelect={() =>
                  navigate({
                    to: t.to,
                    search: t.href.includes("?")
                      ? Object.fromEntries(new URLSearchParams(t.href.split("?")[1]))
                      : undefined,
                  } as never)
                }
                className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-brand-soft"
              >
                {t.label}
                <Count n={badgeFor(t, counts)} />
              </RMenu.Item>
            ))}
          </RMenu.Content>
        </RMenu.Portal>
      </RMenu.Root>
    );

  return (
    <div>
      <div className="relative flex items-center">
        <Link
          to={entry.to}
          aria-current={active && !hasChildren ? "page" : undefined}
          aria-label={collapsed ? `${entry.label}${badge ? `، ${badge}` : ""}` : undefined}
          title={collapsed ? entry.label : entry.hint}
          className={cx(
            row,
            "min-w-0 flex-1",
            collapsed && "justify-center px-0",
            tone(active && !hasChildren),
          )}
          {...(hasChildren ? { "data-section": entry.key } : {})}
        >
          {bar}
          <entry.icon className="size-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span
                className={cx(
                  "min-w-0 flex-1 truncate",
                  active && hasChildren && "font-semibold text-ink",
                )}
              >
                {entry.label}
              </span>
              {!open && <Count n={badge} />}
            </>
          )}
          {collapsed && badge > 0 && (
            <span
              aria-hidden
              className="absolute end-2 top-1.5 size-2 rounded-full bg-red-600 ring-2 ring-surface"
            />
          )}
        </Link>
        {hasChildren && !collapsed && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${open ? "طيّ" : "فتح"} ${entry.label}`}
            onClick={() => setToggled(!open)}
            className="absolute end-1 inset-y-0 my-auto flex size-8 items-center justify-center rounded-md text-muted hover:bg-brand-soft hover:text-ink"
            style={{ insetInlineEnd: "0.25rem" }}
          >
            <ChevronDown
              className={cx(
                "size-4 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {open && (
        <ul id={listId} className="mt-0.5 space-y-0.5 pe-3 ps-[2.1rem]">
          {entry.tabs.map((t) => {
            const on = child?.key === t.key;
            return (
              <li key={t.key}>
                <Link
                  to={t.to}
                  search={
                    t.href.includes("?")
                      ? (Object.fromEntries(new URLSearchParams(t.href.split("?")[1])) as never)
                      : undefined
                  }
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "flex min-h-9 items-center justify-between gap-2 rounded-md px-3 text-[13px] transition-colors",
                    on
                      ? "bg-brand-soft font-semibold text-brand"
                      : "text-muted hover:bg-brand-soft/60 hover:text-ink",
                  )}
                >
                  <span className="truncate">{t.label}</span>
                  <Count n={badgeFor(t, counts)} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Group({
  group,
  activeKey,
  collapsed,
  counts,
  path,
  search,
}: {
  group: NavGroup;
  activeKey: string | null;
  collapsed: boolean;
  counts: Record<string, number>;
  path: string;
  search: NavSearch;
}) {
  return (
    <ul className="space-y-0.5">
      {group.items.map((e) => (
        <li key={e.key}>
          <Item
            entry={e}
            active={e.key === activeKey}
            collapsed={collapsed}
            counts={counts}
            path={path}
            search={search}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The desktop sidebar: the account on top, the sections with their pages as drop-downs in the
 * middle, and settings at the bottom. Foldable to icons.
 */
export function Sidebar({
  groups,
  activeKey,
  user,
  onLogout,
}: {
  groups: NavGroup[];
  activeKey: string | null;
  user: { name: string; role: string };
  onLogout: () => void;
}) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const counts = useAttentionCounts();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as NavSearch;
  const [upper, ...rest] = groups;
  return (
    <aside
      className={cx(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-e bg-surface transition-[width] duration-200 motion-reduce:transition-none lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div className="border-b p-3">
        <UserMenu name={user.name} role={user.role} onLogout={onLogout} collapsed={collapsed} />
      </div>
      <nav aria-label="الأقسام" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {upper && (
            <Group
              group={upper}
              activeKey={activeKey}
              collapsed={collapsed}
              counts={counts}
              path={path}
              search={search}
            />
          )}
        </div>
        {rest.map((g) => (
          <div key={g.key} className="max-h-[45%] overflow-y-auto border-t p-3">
            <Group
              group={g}
              activeKey={activeKey}
              collapsed={collapsed}
              counts={counts}
              path={path}
              search={search}
            />
          </div>
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
