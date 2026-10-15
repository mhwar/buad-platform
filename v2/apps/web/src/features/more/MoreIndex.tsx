import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { api } from "../../api";
import { moreSections } from "../../components/shell/nav-model";
import { Card, PageHeader } from "../../components/ui";
import { meQuery } from "../../session";

/** The phone's «المزيد»: the sections that are not in the bottom bar, plus account and sign-out. */
export function MoreIndex() {
  const me = useQuery(meQuery).data;
  const sections = moreSections(me?.perms ?? []);
  const logout = async () => {
    await api.api.auth.logout.$post().catch(() => undefined);
    window.location.assign("/login");
  };
  return (
    <div>
      <PageHeader title="المزيد" subtitle="بقية أقسام المنصة." />
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.key} to={s.to} className="block">
            <Card className="h-full p-4 transition hover:border-brand">
              <div className="flex items-center gap-2">
                <s.icon className="size-5 text-brand" />
                <p className="font-semibold">{s.label}</p>
              </div>
              <p className="mt-2 text-sm text-muted">{s.hint}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-8 flex flex-wrap items-center justify-between gap-3 p-4">
        <Link to="/settings/account" className="inline-flex min-h-11 items-center gap-2 text-sm">
          <User className="size-4 text-muted" />
          {me?.name || me?.email}
        </Link>
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm text-muted hover:text-ink"
        >
          <LogOut className="size-4" />
          خروج
        </button>
      </Card>
    </div>
  );
}
