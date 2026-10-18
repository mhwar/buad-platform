import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Logo } from "../../brand";
import { NotificationBell } from "../../features/home/NotificationBell";

const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** The top bar: search and notifications on a neutral strip; the logo here on a phone only (the rail has it). */
export function AppHeader({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b bg-chrome/90 text-ink backdrop-blur print:hidden">
      <div className="flex h-full items-center gap-3 px-3 sm:px-5">
        <Link
          to="/"
          aria-label="الرئيسية"
          className="flex shrink-0 items-center rounded-md px-1 lg:hidden"
        >
          <Logo className="hidden h-9 w-auto sm:block" />
          <Logo variant="icon" className="h-8 w-auto sm:hidden" />
        </Link>

        <button
          type="button"
          onClick={onSearch}
          aria-label="بحث وانتقال سريع"
          className="mx-auto hidden h-10 w-full max-w-md items-center gap-3 rounded-lg border bg-canvas px-3 text-sm text-muted transition hover:border-slate-300 hover:text-ink md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-start">ابحث أو انتقل…</span>
          <kbd
            className="rounded-md border bg-surface px-1.5 py-0.5 font-sans text-xs text-muted"
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
            className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-brand-soft hover:text-ink md:hidden"
          >
            <Search className="size-5" />
          </button>
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
