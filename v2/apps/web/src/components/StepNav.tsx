import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { useState } from "react";
import { cx, Dialog, Tabs } from "./ui";

export type Step<K extends string> = { key: K; label: string; badge?: number };

/**
 * Many sections (8 tabs) do not fit a phone. Wide screens keep the tabs; phones get a compact
 * stepper: «الخطوة 3 من 8 · الاسم», a progress bar, previous/next, and a list to jump anywhere.
 */
export function StepNav<K extends string>({
  steps,
  value,
  onChange,
}: {
  steps: Step<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const i = Math.max(
    0,
    steps.findIndex((s) => s.key === value),
  );
  const cur = steps[i];
  const label = (s: Step<K>) => (s.badge ? `${s.label} (${s.badge})` : s.label);
  const go = (n: number) => {
    const t = steps[n];
    if (t) onChange(t.key);
  };
  return (
    <>
      <div className="mb-6 hidden sm:block">
        <Tabs
          items={steps.map((s) => ({
            to: "",
            label: label(s),
            active: s.key === value,
            onClick: () => onChange(s.key),
          }))}
        />
      </div>
      <nav aria-label="الخطوات" className="mb-5 rounded-2xl border bg-surface p-3 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="السابق"
            disabled={i === 0}
            onClick={() => go(i - 1)}
            className="grid size-11 place-items-center rounded-xl border disabled:opacity-40"
          >
            <ChevronRight className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="min-h-11 flex-1 rounded-xl px-2 text-start"
          >
            <span className="block text-xs text-muted">
              الخطوة {i + 1} من {steps.length}
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              {cur ? label(cur) : ""}
              <ListOrdered className="size-4 text-muted" />
            </span>
          </button>
          <button
            type="button"
            aria-label="التالي"
            disabled={i === steps.length - 1}
            onClick={() => go(i + 1)}
            className="grid size-11 place-items-center rounded-xl border disabled:opacity-40"
          >
            <ChevronLeft className="size-5" />
          </button>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${((i + 1) / steps.length) * 100}%` }}
          />
        </div>
      </nav>
      <Dialog open={open} onOpenChange={setOpen} title="الانتقال إلى خطوة">
        <ul className="space-y-1">
          {steps.map((s, n) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.key);
                  setOpen(false);
                }}
                aria-current={s.key === value ? "step" : undefined}
                className={cx(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-base",
                  s.key === value
                    ? "bg-brand-soft font-semibold text-brand"
                    : "hover:bg-brand-soft",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full border text-xs">
                  {n + 1}
                </span>
                <span className="flex-1">{s.label}</span>
                {!!s.badge && (
                  <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {s.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
