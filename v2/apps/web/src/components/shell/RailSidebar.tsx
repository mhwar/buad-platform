import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useMemo } from "react";
import { Logo } from "../../brand";
import { attentionQuery } from "../../features/home/api";
import type { NavSearch } from "../../features/more/tabs";
import { cx } from "../ui";
import { activeChild, badgeFor, type NavEntry, type NavGroup } from "./nav-model";
import { QuickCreate } from "./QuickCreate";
import { Recent } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { useSidebarCollapsed } from "./useSidebarCollapsed";

const NO_COUNTS: Record<string, number> = {};

function useCounts() {
  const q = useQuery(attentionQuery);
  return useMemo(() => {
    const out: Record<string, number> = {};
    const warn = new Set<string>();
    for (const i of q.data?.items ?? []) {
      out[i.key] = i.count;
      if (i.tone === "warn" && i.count > 0) warn.add(i.key);
    }
    return { counts: q.data ? out : NO_COUNTS, warn };
  }, [q.data]);
}

const queryOf = (href: string) =>
  href.includes("?") ? Object.fromEntries(new URLSearchParams(href.split("?")[1])) : undefined;

/** A link with our own "current page" mark (several pages share one path, e.g. finance tabs). */
function Go({
  to,
  search,
  current,
  className,
  children,
  ...rest
}: {
  to: string;
  search?: Record<string, string>;
  current: boolean;
  className: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  const navigate = useNavigate();
  const href = search ? `${to}?${new URLSearchParams(search).toString()}` : to;
  return (
    <a
      {...rest}
      href={href}
      aria-current={current ? "page" : undefined}
      className={className}
      onClick={(e) => {
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        navigate({ to, search } as never);
      }}
    >
      {children}
    </a>
  );
}

/** One section on the rail: its icon, a dot when something waits, its name as a tooltip. */
function RailItem({
  entry,
  active,
  badge,
  urgent,
}: {
  entry: NavEntry;
  active: boolean;
  badge: number;
  urgent: boolean;
}) {
  return (
    <Go
      to={entry.to}
      current={active}
      data-section={entry.key}
      aria-label={`${entry.label}${badge ? `، ${badge}` : ""}`}
      title={entry.label}
      className={cx(
        "group relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] leading-tight transition-colors",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
    >
      <span
        className={cx(
          "relative flex size-10 items-center justify-center rounded-xl transition-colors",
          active
            ? "bg-accent text-black shadow-sm"
            : "group-hover:bg-brand-soft dark:group-hover:bg-slate-800",
        )}
      >
        <entry.icon className="size-[18px]" />
        {badge > 0 && (
          <span
            aria-hidden
            className={cx(
              "absolute -end-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 ring-2 ring-surface",
              urgent ? "bg-red-600 text-white" : "bg-ink text-surface",
            )}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={cx("line-clamp-2 max-w-full text-center", active && "font-semibold")}>
        {entry.label}
      </span>
    </Go>
  );
}

function Count({ n, urgent }: { n: number; urgent: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={cx(
        "min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5",
        urgent
          ? "bg-red-600 text-white"
          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * The computer's sidebar in two levels: a narrow rail with every section (logo on top, settings
 * and the account at the bottom), and beside it the open section's panel — its pages with their
 * counts, «إنشاء جديد» and the recent records. The panel folds away; the rail always stays.
 */
export function RailSidebar({
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
  const { counts, warn } = useCounts();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as NavSearch;
  const [upper, ...rest] = groups;
  const all = groups.flatMap((g) => g.items);
  const current = all.find((e) => e.key === activeKey) ?? null;
  const child = current ? activeChild(current, path, search) : null;
  const urgentOf = (keys: readonly string[]) => keys.some((k) => warn.has(k));
  const item = (e: NavEntry) => (
    <li key={e.key}>
      <RailItem
        entry={e}
        active={e.key === activeKey}
        badge={badgeFor(e, counts)}
        urgent={urgentOf(e.attention)}
      />
    </li>
  );

  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 print:hidden lg:flex">
      <div className="flex w-[4.75rem] flex-col items-stretch border-e bg-surface py-3">
        <Link
          to="/"
          aria-label="الرئيسية"
          className="mx-auto mb-3 flex size-11 items-center justify-center"
        >
          <Logo variant="icon" className="h-8 w-auto" />
        </Link>
        <nav aria-label="الأقسام" className="flex min-h-0 flex-1 flex-col">
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5">
            {upper?.items.map(item)}
          </ul>
          {rest.map((g) => (
            <ul key={g.key} className="mt-2 space-y-1 border-t px-1.5 pt-2">
              {g.items.map(item)}
            </ul>
          ))}
        </nav>
        <div className="mt-2 space-y-1 border-t px-1.5 pt-2">
          <UserMenu name={user.name} role={user.role} onLogout={onLogout} collapsed />
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-pressed={collapsed}
            aria-label={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
            title={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
            className="flex min-h-10 w-full items-center justify-center rounded-xl text-muted transition hover:bg-brand-soft hover:text-ink dark:hover:bg-slate-800"
          >
            {collapsed ? (
              <PanelRightOpen className="size-[18px]" />
            ) : (
              <PanelRightClose className="size-[18px]" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex w-60 flex-col border-e bg-canvas" aria-label="لوحة القسم">
          <div className="space-y-3 p-4">
            <div>
              <h2 className="text-lg font-bold">{current?.label ?? "بُعد"}</h2>
              {current?.hint && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{current.hint}</p>
              )}
            </div>
            <QuickCreate collapsed={false} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
            {current && current.tabs.length > 1 && (
              <nav aria-label={`صفحات ${current.label}`}>
                <ul className="space-y-0.5">
                  {current.tabs.map((t) => {
                    const on = child?.key === t.key;
                    return (
                      <li key={t.key}>
                        <Go
                          to={t.to}
                          search={queryOf(t.href)}
                          current={on}
                          title={t.desc}
                          className={cx(
                            "relative flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 text-sm transition-colors",
                            on
                              ? "bg-surface font-semibold text-ink shadow-sm"
                              : "text-muted hover:bg-surface/70 hover:text-ink",
                          )}
                        >
                          {on && (
                            <span
                              aria-hidden
                              className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-accent"
                            />
                          )}
                          <span className="truncate">{t.label}</span>
                          <Count n={badgeFor(t, counts)} urgent={urgentOf(t.attention)} />
                        </Go>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
            <Recent />
          </div>
        </div>
      )}
    </aside>
  );
}
