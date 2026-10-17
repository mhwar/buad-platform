import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Logo } from "../../brand";
import { NotificationBell } from "../../features/home/NotificationBell";

const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** The top bar: logo on the brand colour, search, notifications, theme and account. */
export function AppHeader({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-white/10 bg-chrome text-white shadow-sm print:hidden">
      <div className="flex h-full items-center gap-3 px-3 sm:px-5">
        <Link to="/" aria-label="الرئيسية" className="flex shrink-0 items-center rounded-md px-1">
          <Logo tone="light" className="hidden h-9 w-auto sm:block" />
          <Logo variant="icon" tone="light" className="h-8 w-auto sm:hidden" />
        </Link>

        <button
          type="button"
          onClick={onSearch}
          aria-label="بحث وانتقال سريع"
          className="mx-auto hidden h-10 w-full max-w-md items-center gap-3 rounded-lg bg-white/10 px-3 text-sm text-white/70 transition hover:bg-white/15 hover:text-white md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-start">ابحث أو انتقل…</span>
          <kbd
            className="rounded bg-white/15 px-1.5 py-0.5 font-sans text-xs text-white/80"
            dir="ltr"
          >
            {isMac() ? "⌘ K" : "Ctrl K"}
          </kbd>
        </button>

        <div className="ms-auto flex items-center gap-1 md:ms-0">
          <button
            type="button"
            onClick={onSearch}
            aria-label="بحث"
            className="inline-flex size-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10 md:hidden"
          >
            <Search className="size-5" />
          </button>
          <NotificationBell onDark />
        </div>
      </div>
    </header>
  );
}
