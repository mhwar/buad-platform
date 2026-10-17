import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cx, ScrollRow } from "../../components/ui";
import { meQuery } from "../../session";
import { attentionQuery } from "../home/api";
import { tabOf, visibleTabs } from "./tabs";

/**
 * The tabs of a section (phones and tablets; the sidebar lists them on wide screens). Shown above a
 * section's list pages, not its detail pages; each page says what it is for in its own header.
 * Counts come from the same feed as the sidebar badges.
 */
export function SectionTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const perms = useQuery(meQuery).data?.perms ?? [];
  const attention = useQuery(attentionQuery).data?.items;
  const current = tabOf(path);
  if (!current) return null;
  const tabs = visibleTabs(current.section, perms);
  const count = (keys: string[] = []) =>
    keys.reduce((n, k) => n + (attention?.find((i) => i.key === k)?.count ?? 0), 0);
  if (tabs.length < 2) return null;
  return (
    <div className="mb-6 lg:hidden">
      <ScrollRow
        role="tablist"
        aria-label={current.section.label}
        activeKey={current.tab.key}
        className="flex gap-1 border-b"
      >
        {tabs.map((t) => {
          const active = t.key === current.tab.key;
          const n = count(t.attention);
          return (
            <Link
              key={t.key}
              to={t.to}
              role="tab"
              aria-selected={active}
              data-key={active ? current.tab.key : undefined}
              className={cx(
                "inline-flex min-h-11 shrink-0 snap-center items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition",
                active
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {n > 0 && (
                <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold leading-5 text-white">
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </ScrollRow>
    </div>
  );
}
