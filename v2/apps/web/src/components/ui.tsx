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
        ? "size-6 text-[11px] rounded-md"
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
                className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted"
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
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; hint?: string; soon?: boolean; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex w-full gap-1 overflow-x-auto rounded-xl border bg-surface p-1 sm:w-auto"
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
            "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm transition sm:flex-none sm:gap-2 sm:px-4",
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
                "rounded px-1.5 text-[10px]",
                value === i.value ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800",
              )}
            >
              قريباً
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A badge that opens a small menu of choices (e.g. project status). */
export function BadgeMenu({
  tone,
  label,
  options,
  onSelect,
  disabled,
}: {
  tone: Tone;
  label: string;
  options: { value: string; label: string; tone: Tone }[];
  onSelect: (v: string) => void;
  disabled?: boolean;
}) {
  if (disabled) return <Badge tone={tone}>{label}</Badge>;
  return (
    <RMenu.Root dir="rtl">
      <RMenu.Trigger
        className={cx(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium outline-none ring-accent focus-visible:ring-2",
          tones[tone],
        )}
        aria-label={`الحالة: ${label} — تغيير`}
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
