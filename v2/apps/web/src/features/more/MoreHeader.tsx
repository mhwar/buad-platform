import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Badge, cx, ScrollRow } from "../../components/ui";
import { meQuery } from "../../session";
import { tabOf, visibleTabs } from "./tabs";

/** Strip of hub tabs plus a short description of the open one. Shown above hub pages. */
export function MoreHeader() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const perms = useQuery(meQuery).data?.perms ?? [];
  const tabs = visibleTabs(perms);
  const current = tabOf(path);
  if (!current) return null;
  return (
    <div className="mb-6 space-y-3">
      <ScrollRow
        role="tablist"
        aria-label="أقسام المزيد"
        activeKey={current.key}
        className="flex gap-1 border-b"
      >
        {tabs.map((t) => {
          const active = t.key === current.key;
          return (
            <Link
              key={t.key}
              to={t.to}
              role="tab"
              aria-selected={active}
              data-key={active ? current.key : undefined}
              className={cx(
                "inline-flex min-h-11 shrink-0 snap-center items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition",
                active
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
              {t.soon && (
                <span className="rounded bg-slate-100 px-1.5 text-[10px] dark:bg-slate-800">
                  قريباً
                </span>
              )}
            </Link>
          );
        })}
      </ScrollRow>
      <div className="rounded-xl bg-brand-soft/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <current.icon className="size-4 text-brand" />
          <p className="font-semibold">{current.label}</p>
          {current.soon && <Badge tone="amber">قريباً</Badge>}
        </div>
        <p className="mt-1 text-sm">{current.desc}</p>
        <p className="mt-0.5 text-xs text-muted">متى تستخدمه: {current.when}</p>
      </div>
    </div>
  );
}
