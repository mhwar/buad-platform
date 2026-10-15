import * as RMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

const initial = (name: string) => [...name.trim()][0] ?? "؟";

/** The signed-in person: initial, name, role, and a menu for account and sign-out. */
export function UserMenu({
  name,
  role,
  onLogout,
}: {
  name: string;
  role: string;
  onLogout: () => void;
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
          className="flex min-h-10 items-center gap-2 rounded-full ps-1 pe-2 text-white/90 transition hover:bg-white/10"
        >
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-full bg-white/15 text-sm font-bold text-white"
          >
            {initial(name)}
          </span>
          <span className="hidden text-start leading-tight xl:block">
            <span className="block max-w-36 truncate text-sm font-medium">{name}</span>
            <span className="block max-w-36 truncate text-[11px] text-white/65">{role}</span>
          </span>
          <ChevronDown className="size-4 text-white/60" />
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
            حسابي والمظهر
          </RMenu.Item>
          <RMenu.Item className={item} onSelect={() => navigate({ to: "/settings" })}>
            <Settings className="size-4 text-muted" />
            الإعدادات
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
