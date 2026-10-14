import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { api } from "../../api";
import { Badge, Card, PageHeader } from "../../components/ui";
import { meQuery } from "../../session";
import { ThemeToggle } from "../../theme";
import { GROUPS, type MoreTab, visibleTabs } from "./tabs";

/** «المزيد»: every section beyond the four basics, each with what it is for. */
export function MoreIndex() {
  const me = useQuery(meQuery).data;
  const tabs = visibleTabs(me?.perms ?? []);
  const logout = async () => {
    await api.api.auth.logout.$post().catch(() => undefined);
    window.location.assign("/login");
  };
  return (
    <div>
      <PageHeader title="المزيد" subtitle="كل أقسام المنصة غير الأساسية في مكان واحد." />
      <div className="space-y-6">
        {(Object.keys(GROUPS) as MoreTab["group"][]).map((g) => {
          const items = tabs.filter((t) => t.group === g);
          if (!items.length) return null;
          return (
            <section key={g} aria-label={GROUPS[g]}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{GROUPS[g]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <Link key={t.key} to={t.to} className="block">
                    <Card className="h-full p-4 transition hover:border-brand">
                      <div className="flex items-center gap-2">
                        <t.icon className="size-5 text-brand" />
                        <p className="font-semibold">{t.label}</p>
                        {t.soon && <Badge tone="amber">قريباً</Badge>}
                      </div>
                      <p className="mt-2 text-sm text-muted">{t.desc}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-3 p-4">
        <Link to="/settings/account" className="inline-flex min-h-11 items-center gap-2 text-sm">
          <User className="size-4 text-muted" />
          {me?.name || me?.email}
        </Link>
        <div className="flex items-center gap-3 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm text-muted hover:text-ink"
          >
            <LogOut className="size-4" />
            خروج
          </button>
        </div>
      </Card>
    </div>
  );
}
