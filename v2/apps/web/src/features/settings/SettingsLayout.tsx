import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import {
  Building2,
  Database,
  FileUp,
  History,
  KeyRound,
  Landmark,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { ScrollRow } from "../../components/ui";
import { meQuery } from "../../session";
import { sectionByKey, visibleTabs } from "../more/tabs";

export const SETTINGS_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  overview: LayoutGrid,
  org: Building2,
  finance: Landmark,
  team: ShieldCheck,
  activity: History,
  data: Database,
  import: FileUp,
  account: KeyRound,
};

/**
 * «الإعدادات»: one home for organisation-wide options, each a sub-page. The pages are the
 * settings section's tabs, so this strip (phones and tablets) and the sidebar list the same
 * pages in the same order; on a wide screen the sidebar alone navigates.
 */
export function SettingsLayout() {
  const perms = useQuery(meQuery).data?.perms ?? [];
  const section = sectionByKey("settings");
  const items = section ? visibleTabs(section, perms) : [];
  const link =
    "flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-brand-soft hover:text-ink";
  const active = "bg-brand-soft font-semibold text-brand";
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="الإعدادات" className="border-b pb-2 lg:hidden">
        <ScrollRow className="flex gap-1">
          {items.map((i) => {
            const Icon = SETTINGS_ICONS[i.key] ?? Building2;
            return (
              <Link
                key={i.key}
                to={i.to}
                className={link}
                activeOptions={{ exact: i.key === "overview" }}
                activeProps={{ className: active }}
              >
                <Icon className="size-4 shrink-0" />
                {i.label}
              </Link>
            );
          })}
        </ScrollRow>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
