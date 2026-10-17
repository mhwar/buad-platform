import * as RDialog from "@radix-ui/react-dialog";
import * as RMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { ChevronDown, LayoutGrid, List, MoreHorizontal, Search, X } from "lucide-react";
import {
  type ComponentProps,
  cloneElement,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { twMerge } from "tailwind-merge";

/** Class joiner that resolves Tailwind conflicts: the later class wins (`w-full` + `w-auto` → `w-auto`). */
const cx = (...xs: (string | false | null | undefined)[]) => twMerge(xs.filter(Boolean).join(" "));

/* ── Buttons ─────────────────────────────────────────── */
const btn = {
  primary: "bg-brand text-white hover:bg-brand-strong dark:text-canvas",
  secondary: "border bg-surface text-ink hover:bg-brand-soft",
  ghost: "text-muted hover:bg-brand-soft hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-700",
};
export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & { variant?: keyof typeof btn }
>(function Button({ variant = "primary", className, ...p }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...p}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10",
        btn[variant],
        className,
      )}
    />
  );
});

/* ── Form fields ─────────────────────────────────────── */
const control =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink sm:text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

/**
 * Label + control + hint/error, linked explicitly (htmlFor, aria-describedby, aria-invalid)
 * so screen readers announce just the label, then the error.
 */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={cx("text-sm", className)}>
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": note ? noteId : undefined,
      })}
      {note && (
        <span
          id={noteId}
          className={cx(
            "mt-1 block text-xs",
            error ? "text-red-600 dark:text-red-400" : "text-muted",
          )}
        >
          {note}
        </span>
      )}
    </div>
  );
}
export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>((p, ref) => (
  <input ref={ref} {...p} className={cx(control, p.className)} />
));
export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>((p, ref) => (
  <textarea ref={ref} rows={3} {...p} className={cx(control, p.className)} />
));
export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select">>((p, ref) => (
  <select ref={ref} {...p} className={cx(control, "appearance-auto", p.className)} />
));

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[14rem] flex-1">
      <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(control, "pr-9")}
      />
    </div>
  );
}

/* ── Display ─────────────────────────────────────────── */
const tones = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-brand-soft text-brand",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return (
    <div
      {...p}
      className={cx("rounded-2xl border border-line bg-surface p-5 shadow-sm", className)}
    />
  );
}

export function Avatar({
  name,
  logo,
  size = "md",
}: {
  name: string;
  logo?: string;
  size?: "xs" | "md" | "lg";
}) {
  const s =
    size === "lg"
      ? "size-16 text-2xl rounded-xl"
      : size === "xs"
        ? "size-6 text-xs rounded-md"
        : "size-11 text-base rounded-xl";
  if (logo)
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        className={cx(
          "shrink-0 border bg-white object-contain",
          size === "xs" ? "p-0.5" : "p-1",
          s,
        )}
      />
    );
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center bg-brand-soft font-bold text-brand", s)}
    >
      {name.trim().charAt(0) || "؟"}
    </span>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  moreActions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Secondary actions: a «⋯» menu on phones only (hide their desktop buttons with `hidden sm:inline-flex`). */
  moreActions?: MenuItem[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {(actions || moreActions) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {moreActions && (
            <div className="sm:hidden">
              <Menu items={moreActions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A horizontally scrolling row (tabs, segmented switchers, chips) that tells you there is more:
 * the edge that still has content fades out, and the active item is brought into view.
 * RTL-aware (scrollLeft is negative there). `activeKey` changes re-centre the active item.
 */
export function ScrollRow({
  children,
  className,
  activeKey,
  ...rest
}: ComponentProps<"div"> & { activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setEdge({ start: pos < 4, end: max - pos < 4 });
  }, []);
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the active item changes
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>(
      '[aria-selected="true"],[aria-pressed="true"]',
    );
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    active?.scrollIntoView?.({
      inline: "center",
      block: "nearest",
      behavior: calm ? "auto" : "smooth",
    });
  }, [activeKey]);
  const fade = edge.start && edge.end ? undefined : 28;
  return (
    <div
      ref={ref}
      onScroll={update}
      {...rest}
      className={cx(
        "snap-x overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={
        fade
          ? {
              maskImage: `linear-gradient(to right, ${edge.end ? "#000" : "transparent"} 0, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edge.start ? "#000" : "transparent"} 100%)`,
              WebkitMaskImage: `linear-gradient(to right, ${edge.end ? "#000" : "transparent"} 0, #000 ${fade}px, #000 calc(100% - ${fade}px), ${edge.start ? "#000" : "transparent"} 100%)`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/**
 * How a list is shown (list / board / table): icons only, so it never takes a row of its own;
 * each keeps its name for screen readers and as a tooltip.
 */
export function LayoutToggle<T extends string>({
  value,
  onChange,
  items,
  label = "طريقة العرض",
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; icon: ReactNode }[];
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex shrink-0 gap-1 rounded-xl border bg-surface p-1"
    >
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          role="tab"
          aria-selected={value === i.value}
          aria-label={i.label}
          title={i.label}
          onClick={() => onChange(i.value)}
          className={cx(
            "grid size-10 place-items-center rounded-lg transition sm:size-9",
            value === i.value
              ? "bg-brand text-white dark:text-canvas"
              : "text-muted hover:bg-brand-soft hover:text-ink",
          )}
        >
          {i.icon}
        </button>
      ))}
    </div>
  );
}

export function Pills<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T | "";
  onChange: (v: T | "") => void;
  items: { value: T | ""; label: string; count?: number }[];
}) {
  return (
    <ScrollRow
      className="-mx-4 flex max-w-[calc(100%+2rem)] gap-2 px-4 pb-1 sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0"
      role="tablist"
      activeKey={value}
    >
      {items.map((i) => (
        <button
          key={i.value || "all"}
          type="button"
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            "min-h-10 shrink-0 snap-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition sm:min-h-0 sm:py-1",
            value === i.value
              ? "border-brand bg-brand text-white dark:text-canvas"
              : "bg-surface text-muted hover:text-ink",
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="ms-1.5 opacity-70">{i.count}</span>}
        </button>
      ))}
    </ScrollRow>
  );
}

export function ViewToggle({
  value,
  onChange,
}: {
  value: "grid" | "list";
  onChange: (v: "grid" | "list") => void;
}) {
  const b = (v: "grid" | "list", label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={cx(
        "grid min-h-10 min-w-10 place-items-center rounded-md sm:min-h-0 sm:min-w-0 sm:p-1.5",
        value === v ? "bg-brand-soft text-brand" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
  return (
    <div className="flex rounded-lg border bg-surface p-0.5">
      {b("grid", "عرض شبكي", LayoutGrid)}
      {b("list", "عرض قائمة", List)}
    </div>
  );
}

export function Tabs({
  items,
}: {
  items: {
    to: string;
    label: string;
    disabled?: boolean;
    params?: Record<string, string>;
    active: boolean;
    onClick?: () => void;
  }[];
}) {
  return (
    <ScrollRow
      className="mb-6 flex gap-1 border-b"
      role="tablist"
      activeKey={items.find((t) => t.active)?.label}
    >
      {items.map((t) => (
        <button
          key={t.label}
          type="button"
          role="tab"
          aria-selected={t.active}
          disabled={t.disabled}
          onClick={t.onClick}
          className={cx(
            "-mb-px min-h-11 shrink-0 snap-center whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
            t.active
              ? "border-brand font-semibold text-ink"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.disabled && <span className="ms-1.5 text-xs">(قريباً)</span>}
        </button>
      ))}
    </ScrollRow>
  );
}

export function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export function Notice({
  tone = "red",
  children,
}: {
  tone?: "red" | "amber" | "blue";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "blue" ? "status" : "alert"}
      className={cx("mb-4 rounded-lg px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

/* ── Dialog & menu (Radix: focus trap, Esc, aria) ────── */
/**
 * One dialog for the whole platform: a title bar, a body that scrolls, and an optional footer that
 * stays in place (on a phone it sits at the bottom of the sheet, above the home bar). On a wide
 * screen the first field takes the focus, so typing starts at once.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** Usually a <DialogActions>: shown under the body, never scrolled away. */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content
          ref={ref}
          dir="rtl"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // On a phone the keyboard would cover the sheet: let the person tap the field.
            if (
              typeof window.matchMedia === "function" &&
              !window.matchMedia("(min-width: 640px)").matches
            )
              return;
            const first = ref.current?.querySelector<HTMLElement>(
              "input:not([type=hidden]):not([type=checkbox]):not([disabled]), select:not([disabled]), textarea:not([disabled])",
            );
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
          className={cx(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border bg-surface shadow-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85vh] sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5 pb-4">
            <RDialog.Title className="text-lg font-bold">{title}</RDialog.Title>
            <RDialog.Close
              className="grid size-10 place-items-center rounded-lg text-muted hover:bg-brand-soft hover:text-ink"
              aria-label="إغلاق"
            >
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div
            className={cx(
              "min-h-0 flex-1 overflow-y-auto px-6",
              footer ? "pb-5" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
            )}
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
              {footer}
            </div>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/**
 * The same footer in every dialog: the main action first (rightmost; full width at the bottom of
 * a phone sheet), «إلغاء» beside it, and a destructive action set apart at the far end.
 */
export function DialogActions({
  children,
  onCancel,
  cancelLabel = "إلغاء",
  aside,
}: {
  /** The main action (a primary <Button>), optionally followed by a secondary one. */
  children: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  /** Kept apart at the far end: a delete, or a hint. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center [&>button]:w-full sm:[&>button]:w-auto">
      {children}
      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
      {aside && <div className="flex justify-center sm:me-auto">{aside}</div>}
    </div>
  );
}

/* ── Confirmation: one look for every «are you sure?» ─── */
type ConfirmAsk = {
  title: string;
  text?: string;
  /** The button names the action («حذف نهائياً»), never «موافق». */
  action?: string;
  danger?: boolean;
};
type ConfirmReq = ConfirmAsk & { resolve: (ok: boolean) => void };
let pushConfirm: ((r: ConfirmReq) => void) | null = null;

/**
 * Asks before something that cannot be taken back; resolves true when the person confirms.
 * Without the host mounted (a bare test render) it falls back to the browser's own prompt.
 */
export function confirmAction(ask: ConfirmAsk): Promise<boolean> {
  const push = pushConfirm;
  if (!push)
    return Promise.resolve(window.confirm(ask.text ? `${ask.title}\n${ask.text}` : ask.title));
  return new Promise((resolve) => push({ ...ask, resolve }));
}

/** Mounted once in the shell: shows the confirmation dialogs that confirmAction asks for. */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    pushConfirm = (r) => setReq(r);
    return () => {
      pushConfirm = null;
    };
  }, []);
  const answer = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  return (
    <RDialog.Root open={!!req} onOpenChange={(o) => !o && answer(false)}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content
          dir="rtl"
          role="alertdialog"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // The safe answer has the focus: Enter alone never deletes anything.
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <RDialog.Title className="text-lg font-bold">{req?.title}</RDialog.Title>
          {req?.text && <p className="mt-2 text-sm text-muted">{req.text}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center [&>button]:w-full sm:[&>button]:w-auto">
            <Button variant={req?.danger ? "danger" : "primary"} onClick={() => answer(true)}>
              {req?.action ?? "تأكيد"}
            </Button>
            <Button ref={cancelRef} variant="ghost" onClick={() => answer(false)}>
              إلغاء
            </Button>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ── Toast: a short «done» after saving ─────────────── */
type Toast = { id: number; text: string; tone: "ok" | "error" };
let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;
/** «حُفظ» after a save: a quiet line at the bottom that leaves by itself. */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  pushToast?.({ text, tone });
}
/** Mounted once in the shell; announced politely to screen readers. */
export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      {items.map((t) => (
        <p
          key={t.id}
          role="status"
          className={cx(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg",
            t.tone === "ok" ? "bg-ink text-canvas" : "bg-red-600 text-white",
          )}
        >
          {t.tone === "ok" ? "✓ " : ""}
          {t.text}
        </p>
      ))}
    </div>
  );
}

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      danger?: boolean;
      icon?: ReactNode;
      hint?: string;
      disabled?: boolean;
    }
  | { section: string }
  | "separator";

/** «⋯» menu: grouped actions with icons; sections and separators keep long menus scannable. */
export function Menu({ items, label = "المزيد" }: { items: MenuItem[]; label?: string }) {
  if (!items.some((i) => typeof i === "object" && "label" in i)) return null;
  return (
    <RMenu.Root dir="rtl">
      <RMenu.Trigger asChild>
        <Button variant="secondary" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-60 rounded-xl border bg-surface p-1 shadow-lg"
        >
          {items.map((i, n) =>
            i === "separator" ? (
              <RMenu.Separator key={`sep-${n}`} className="my-1 h-px bg-line" />
            ) : "section" in i ? (
              <RMenu.Label
                key={`sec-${i.section}`}
                className="px-3 pt-2 pb-1 text-xs font-semibold text-muted"
              >
                {i.section}
              </RMenu.Label>
            ) : (
              <RMenu.Item
                key={i.label}
                onSelect={i.onSelect}
                disabled={i.disabled}
                className={cx(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-brand-soft data-[disabled]:opacity-50",
                  i.danger && "text-red-600",
                )}
              >
                {i.icon && (
                  <span className="mt-0.5 shrink-0 text-muted [&>svg]:size-4">{i.icon}</span>
                )}
                <span>
                  {i.label}
                  {i.hint && <span className="block text-xs text-muted">{i.hint}</span>}
                </span>
              </RMenu.Item>
            ),
          )}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export { cx, Link };

/**
 * Side sheet (Radix dialog): slides in from the inline-end edge on desktop, full screen on phones.
 * Used for settings that are set up once and only revisited, so they do not take page space.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" />
        <RDialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-full flex-col border-r bg-surface shadow-2xl sm:max-w-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <RDialog.Title className="text-lg font-bold">{title}</RDialog.Title>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <RDialog.Close className="rounded-md p-1 text-muted hover:text-ink" aria-label="إغلاق">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="border-t px-6 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Compact section switcher: a few sections instead of a growing row of tabs. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  inline = false,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; hint?: string; soon?: boolean; icon?: ReactNode }[];
  label: string;
  /** Sits beside other controls on a phone too, instead of taking a full row. */
  inline?: boolean;
}) {
  return (
    <ScrollRow
      role="tablist"
      aria-label={label}
      activeKey={value}
      className={cx(
        "flex gap-1 rounded-xl border bg-surface p-1",
        inline ? "inline-flex w-auto shrink-0" : "w-full sm:inline-flex sm:w-auto",
      )}
    >
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          role="tab"
          aria-selected={value === i.value}
          title={i.hint}
          onClick={() => onChange(i.value)}
          className={cx(
            "inline-flex min-h-11 flex-1 shrink-0 snap-center items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition sm:min-h-0 sm:flex-none sm:gap-2 sm:px-4",
            value === i.value
              ? "bg-brand text-white shadow-sm dark:text-canvas"
              : "text-muted hover:bg-brand-soft hover:text-ink",
          )}
        >
          {i.icon}
          {i.label}
          {i.soon && (
            <span
              className={cx(
                "rounded px-1.5 text-xs",
                value === i.value ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800",
              )}
            >
              قريباً
            </span>
          )}
        </button>
      ))}
    </ScrollRow>
  );
}

/** A badge that opens a small menu of choices (e.g. project status). */
export function BadgeMenu({
  tone,
  label,
  options,
  onSelect,
  disabled,
  name,
}: {
  tone: Tone;
  label: string;
  options: { value: string; label: string; tone: Tone }[];
  onSelect: (v: string) => void;
  disabled?: boolean;
  /** What the status belongs to, for screen readers («حالة جهّز العرض»). */
  name?: string;
}) {
  if (disabled) return <Badge tone={tone}>{label}</Badge>;
  return (
    <RMenu.Root dir="rtl">
      <RMenu.Trigger
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium outline-none ring-accent focus-visible:ring-2",
          tones[tone],
        )}
        aria-label={name ? `حالة ${name}: ${label} — تغيير` : `الحالة: ${label} — تغيير`}
      >
        {label}
        <ChevronDown className="size-3" />
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-40 rounded-xl border bg-surface p-1 shadow-lg"
        >
          {options.map((o) => (
            <RMenu.Item
              key={o.value}
              onSelect={() => onSelect(o.value)}
              className="cursor-pointer rounded-lg px-2 py-1.5 outline-none data-[highlighted]:bg-brand-soft"
            >
              <Badge tone={o.tone}>{o.label}</Badge>
            </RMenu.Item>
          ))}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}
