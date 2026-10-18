import { Link, useRouterState } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { cx } from "./ui";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
  /** Extra paths that also count as this item (e.g. every page inside «المزيد»). */
  also?: (path: string) => boolean;
};

export const isNavActive = (path: string, n: NavItem) =>
  (n.exact ? path === n.to : path === n.to || path.startsWith(`${n.to}/`)) || !!n.also?.(path);

/**
 * Phone navigation: the five main sections in a bottom bar (reachable by thumb, safe-area aware).
 * «المزيد» opens the drawer with everything else (or the hub page when there is no drawer).
 */
export function MobileTabBar({
  nav,
  onMore,
  moreOpen = false,
}: {
  nav: readonly NavItem[];
  /** «المزيد» opens the drawer instead of a page. */
  onMore?: () => void;
  moreOpen?: boolean;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-30 print:hidden border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {nav.map((n) => {
          const active =
            n.to === "/more" && onMore ? moreOpen || isNavActive(path, n) : isNavActive(path, n);
          if (n.to === "/more" && onMore)
            return (
              <button
                key={n.to}
                type="button"
                onClick={onMore}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                className={cx(
                  "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition",
                  active ? "text-brand" : "text-muted",
                )}
              >
                {active && (
                  <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-accent" />
                )}
                <n.icon className="size-5" />
                {n.label}
              </button>
            );
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition",
                active ? "text-brand" : "text-muted",
              )}
            >
              {active && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-accent" />}
              <n.icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
