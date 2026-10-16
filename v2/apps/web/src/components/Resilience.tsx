import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button, Card, cx } from "./ui";

/** One loading placeholder for the whole app: a calm block the size of what is coming. */
export function Skeleton({
  className,
  label = "جارٍ التحميل",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy
      aria-label={label}
      className={cx(
        "animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800",
        className ?? "h-32",
      )}
    />
  );
}

/** A list of cards still loading, laid out like the cards will be. */
export function SkeletonGrid({
  count = 3,
  label = "جارٍ التحميل",
  className = "h-48",
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy
      aria-label={label}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cx("animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800", className)}
        />
      ))}
    </div>
  );
}

/** A page still loading: its title line, a summary band and the body. */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy aria-label="جارٍ تحميل الصفحة" className="space-y-4">
      <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function Failed({
  title,
  detail,
  onRetry,
  home = false,
  partial = false,
}: {
  title: string;
  detail?: string;
  onRetry: () => void;
  home?: boolean;
  /** Only part of the page failed: say the rest still works. */
  partial?: boolean;
}) {
  return (
    <Card role="alert" className="flex flex-wrap items-center gap-3 border-amber-300 p-4">
      <AlertTriangle className="size-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">
          {partial && "بقية الصفحة تعمل. "}أعد المحاولة، وإن تكرّر الخطأ فأبلغ مسؤول المنصة.
        </p>
        {detail && import.meta.env.DEV && (
          <p className="mt-1 text-xs text-muted" dir="ltr">
            {detail}
          </p>
        )}
      </div>
      <Button variant="secondary" onClick={onRetry}>
        <RotateCcw className="size-4" />
        إعادة المحاولة
      </Button>
      {home && (
        <Link to="/" className="text-sm text-brand hover:underline">
          الرئيسية
        </Link>
      )}
    </Card>
  );
}

/**
 * Keeps a failure inside one card or panel: the rest of the page stays usable and the broken
 * part offers to try again instead of taking the screen down with it.
 */
export class SectionBoundary extends Component<
  { label: string; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error(`section_failed:${this.props.label}`, error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Failed
        title={`تعذّر عرض «${this.props.label}»`}
        detail={this.state.error.message}
        partial
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

/** A page that failed to load or render: the shell stays, with a way to try again or go home. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Failed
      title="تعذّر عرض هذه الصفحة"
      detail={error instanceof Error ? error.message : String(error)}
      home
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}
