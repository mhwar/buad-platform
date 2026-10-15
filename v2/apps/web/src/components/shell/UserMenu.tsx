import * as RMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, User } from "lucide-react";
import { cx } from "../ui";

const initial = (name: string) => [...name.trim()][0] ?? "؟";

/** The signed-in person at the top of the sidebar: initial, name, role, and a menu for account and sign-out. */
export function UserMenu({
  name,
  role,
  onLogout,
  collapsed = false,
}: {
  name: string;
  role: string;
  onLogout: () => void;
  collapsed?: boolean;
}) {
  const navigate = useNavigate();
  const item =
    "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-brand-soft";
  return (
    <RMenu.Root dir="rtl">
      <RMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`حساب ${name}`}
          title={collapsed ? name : undefined}
          className={cx(
            "flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-start transition hover:bg-brand-soft/60",
            collapsed && "justify-center px-0",
          )}
        >
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white dark:text-canvas"
          >
            {initial(name)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">{name}</span>
                <span className="block truncate text-xs text-muted">{role}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted" />
            </>
          )}
        </button>
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-56 rounded-xl border bg-surface p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted">{role}</p>
          </div>
          <RMenu.Separator className="my-1 h-px bg-line" />
          <RMenu.Item className={item} onSelect={() => navigate({ to: "/settings/account" })}>
            <User className="size-4 text-muted" />
            حسابي وكلمة المرور
          </RMenu.Item>
          <RMenu.Separator className="my-1 h-px bg-line" />
          <RMenu.Item className={`${item} text-red-600`} onSelect={onLogout}>
            <LogOut className="size-4" />
            تسجيل الخروج
          </RMenu.Item>
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}
