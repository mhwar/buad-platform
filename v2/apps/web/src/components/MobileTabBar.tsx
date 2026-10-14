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
 * «المزيد» is one of them and opens the hub page that holds everything else.
 */
export function MobileTabBar({ nav }: { nav: readonly NavItem[] }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-xl">
        {nav.map((n) => {
          const active = isNavActive(path, n);
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition",
                active ? "text-brand" : "text-muted",
              )}
            >
              {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" />}
              <n.icon className="size-5" />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
