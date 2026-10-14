import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu as MenuIcon, Settings, User } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { ThemeToggle } from "../theme";
import { cx, Dialog } from "./ui";

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact: boolean;
};

const isActive = (path: string, n: NavItem) =>
  n.exact ? path === n.to : path === n.to || path.startsWith(`${n.to}/`);

/**
 * Phone navigation: the four sections used most sit in a bottom bar (reachable by thumb, safe-area
 * aware), «المزيد» opens a sheet with the rest, the account, the theme and sign-out.
 * `primary` are the paths shown in the bar; every other item goes into the sheet.
 */
export function MobileTabBar({
  nav,
  primary,
  userName,
  onLogout,
}: {
  nav: readonly NavItem[];
  primary: readonly string[];
  userName: string;
  onLogout: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [more, setMore] = useState(false);
  const inBar = nav.filter((n) => primary.includes(n.to));
  const rest = nav.filter((n) => !primary.includes(n.to));
  const moreActive =
    rest.some((n) => isActive(path, n)) || path.startsWith("/settings") || path === "/account";
  const item =
    "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition";
  return (
    <>
      <nav
        aria-label="التنقل الرئيسي"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {inBar.map((n) => {
            const active = isActive(path, n);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={cx(item, active ? "text-brand" : "text-muted")}
              >
                {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" />}
                <n.icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            className={cx(item, moreActive ? "text-brand" : "text-muted")}
          >
            {moreActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-brand" />}
            <MenuIcon className="size-5" />
            المزيد
          </button>
        </div>
      </nav>

      <Dialog open={more} onOpenChange={setMore} title="المزيد">
        <div className="space-y-1">
          {rest.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setMore(false)}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-brand-soft"
            >
              <n.icon className="size-5 text-muted" />
              {n.label}
            </Link>
          ))}
          <Link
            to="/settings"
            onClick={() => setMore(false)}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-brand-soft"
          >
            <Settings className="size-5 text-muted" />
            الإعدادات
          </Link>
          <Link
            to="/settings/account"
            onClick={() => setMore(false)}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-brand-soft"
          >
            <User className="size-5 text-muted" />
            حسابي
            <span className="ms-auto text-sm text-muted">{userName}</span>
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-4">
          <ThemeToggle />
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm text-muted hover:text-ink"
          >
            <LogOut className="size-4" />
            خروج
          </button>
        </div>
      </Dialog>
    </>
  );
}
