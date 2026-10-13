import * as RDialog from "@radix-ui/react-dialog";
import * as RMenu from "@radix-ui/react-dropdown-menu";
import { Link } from "@tanstack/react-router";
import { LayoutGrid, List, MoreHorizontal, Search, X } from "lucide-react";
import {
  type ComponentProps,
  cloneElement,
  forwardRef,
  type ReactElement,
  type ReactNode,
  useId,
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
export function Button({
  variant = "primary",
  className,
  ...p
}: ComponentProps<"button"> & { variant?: keyof typeof btn }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60",
        btn[variant],
        className,
      )}
    />
  );
}

/* ── Form fields ─────────────────────────────────────── */
const control =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

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
    <div className="relative flex-1">
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
  size?: "md" | "lg";
}) {
  const s = size === "lg" ? "size-16 text-2xl" : "size-11 text-base";
  if (logo)
    return (
      <img
        src={logo}
        alt=""
        className={cx(s, "shrink-0 rounded-xl border bg-white object-contain p-1")}
      />
    );
  return (
    <span
      aria-hidden
      className={cx(
        s,
        "grid shrink-0 place-items-center rounded-xl bg-brand-soft font-bold text-brand",
      )}
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
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
    <div className="flex flex-wrap gap-2" role="tablist">
      {items.map((i) => (
        <button
          key={i.value || "all"}
          type="button"
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={cx(
            "rounded-full border px-3 py-1 text-sm transition",
            value === i.value
              ? "border-brand bg-brand text-white dark:text-canvas"
              : "bg-surface text-muted hover:text-ink",
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="ms-1.5 opacity-70">{i.count}</span>}
        </button>
      ))}
    </div>
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
        "rounded-md p-1.5",
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
    <div className="mb-6 flex gap-1 overflow-x-auto border-b" role="tablist">
      {items.map((t) => (
        <button
          key={t.label}
          type="button"
          role="tab"
          aria-selected={t.active}
          disabled={t.disabled}
          onClick={t.onClick}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
            t.active
              ? "border-brand font-semibold text-ink"
              : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.disabled && <span className="ms-1.5 text-xs">(قريباً)</span>}
        </button>
      ))}
    </div>
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
  tone?: "red" | "amber";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cx("mb-4 rounded-lg px-3 py-2 text-sm", tone === "red" ? tones.red : tones.amber)}
    >
      {children}
    </div>
  );
}

/* ── Dialog & menu (Radix: focus trap, Esc, aria) ────── */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className={cx(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border bg-surface p-6 shadow-xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          )}
        >
          <div className="mb-5 flex items-center justify-between">
            <RDialog.Title className="text-lg font-bold">{title}</RDialog.Title>
            <RDialog.Close className="rounded-md p-1 text-muted hover:text-ink" aria-label="إغلاق">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Menu({
  items,
}: {
  items: { label: string; onSelect: () => void; danger?: boolean }[];
}) {
  if (!items.length) return null;
  return (
    <RMenu.Root dir="rtl">
      <RMenu.Trigger asChild>
        <Button variant="secondary" aria-label="المزيد">
          <MoreHorizontal className="size-4" />
        </Button>
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-xl border bg-surface p-1 shadow-lg"
        >
          {items.map((i) => (
            <RMenu.Item
              key={i.label}
              onSelect={i.onSelect}
              className={cx(
                "cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-soft",
                i.danger && "text-red-600",
              )}
            >
              {i.label}
            </RMenu.Item>
          ))}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export { cx, Link };
