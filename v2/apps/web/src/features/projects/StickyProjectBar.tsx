import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cx } from "../../components/ui";

/** The app header's height (h-14): the bar sits right under it. */
const HEADER = 56;

/**
 * Once the project's own header has scrolled away, a compact bar slides in under the app header:
 * the name and status, the main actions and the section tabs stay one tap away however far down
 * the page is. It takes no room in the page (so nothing jumps), and it tells sticky table headers
 * below how much space it covers through `--sticky-top`.
 */
export function StickyProjectBar({
  watch,
  title,
  status,
  actions,
  tabs,
}: {
  /** The page header: the bar shows while this is out of view. */
  watch: RefObject<HTMLElement | null>;
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShown(!!e && !e.isIntersecting), {
      rootMargin: `-${HEADER}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);

  // Sticky table headers further down sit under the bar, not behind it.
  useEffect(() => {
    const root = document.documentElement;
    if (!shown) {
      root.style.removeProperty("--sticky-top");
      return;
    }
    const set = () =>
      root.style.setProperty("--sticky-top", `${HEADER + (bar.current?.offsetHeight ?? 0)}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    if (bar.current && ro) ro.observe(bar.current);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--sticky-top");
    };
  }, [shown]);

  return (
    <div className="sticky top-14 z-20 -mx-4 h-0 sm:-mx-6 lg:-mx-8 print:hidden">
      <div
        ref={bar}
        aria-hidden={!shown}
        inert={!shown}
        className={cx(
          "absolute inset-x-0 top-0 border-b bg-surface/95 px-4 py-2 shadow-sm backdrop-blur transition duration-150 motion-reduce:transition-none sm:px-6 lg:px-8",
          shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="truncate font-bold">{title}</p>
            <span className="shrink-0 whitespace-nowrap">{status}</span>
          </div>
          {/* Computer: name · tabs · actions in one row. Phone: tabs drop to a row of their own. */}
          {tabs && <div className="min-w-0 max-lg:order-last max-lg:w-full">{tabs}</div>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
