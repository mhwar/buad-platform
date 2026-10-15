import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { Building2, FileUp, History, KeyRound, ShieldCheck } from "lucide-react";
import { meQuery } from "../../session";

const ITEMS = [
  { to: "/settings/org", label: "بيانات الجهة", hint: "الهوية والترويسة والختم", icon: Building2 },
  {
    to: "/settings/import",
    label: "استيراد البيانات",
    hint: "نقل العملاء والمشاريع من المنصة الحالية",
    icon: FileUp,
    perm: "import.run",
  },
  {
    to: "/settings/team",
    label: "الفريق والصلاحيات",
    hint: "المستخدمون والأدوار وما يراه كل دور",
    icon: ShieldCheck,
    perm: "team.view",
  },
  {
    to: "/settings/activity",
    label: "سجل النشاط",
    hint: "من غيّر ماذا ومتى",
    icon: History,
    perm: "audit.view",
  },
  {
    to: "/settings/account",
    label: "حسابي والمظهر",
    hint: "كلمة المرور ونمط اللون",
    icon: KeyRound,
  },
] as const;

/** «الإعدادات»: one home for organisation-wide options, each a sub-page. */
export function SettingsLayout() {
  const perms = useQuery(meQuery).data?.perms ?? [];
  const items = ITEMS.filter((i) => !("perm" in i) || perms.includes(i.perm));
  const link =
    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-brand-soft hover:text-ink";
  const active = "bg-brand-soft font-semibold text-brand";
  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <nav
        aria-label="الإعدادات"
        className="flex gap-1 overflow-x-auto border-b pb-2 xl:sticky xl:top-20 xl:w-56 xl:shrink-0 xl:flex-col xl:self-start xl:border-b-0 xl:border-l xl:pb-0 xl:pl-4"
      >
        <p className="mb-2 hidden px-3 text-xs font-semibold text-muted xl:block">الإعدادات</p>
        {items.map((i) => (
          <Link key={i.to} to={i.to} className={link} activeProps={{ className: active }}>
            <i.icon className="size-4 shrink-0" />
            <span>
              {i.label}
              <span className="hidden text-xs font-normal text-muted xl:block">{i.hint}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
