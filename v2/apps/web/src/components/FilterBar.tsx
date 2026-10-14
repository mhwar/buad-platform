import { Check, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, cx, Dialog, Select } from "./ui";

export type FilterField = {
  key: string;
  /** Short name: the label of the control and of the chip («الحالة»). */
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** What "no filter" is called («كل الحالات»). */
  allLabel: string;
};

/**
 * Filters that adapt to the screen. Wide screens: the inline selects. Phones: ONE «تصفية» button
 * (with how many are active) that opens a bottom sheet of big tap-able choices, and the active
 * filters as removable chips underneath. State lives in the caller (URL params), so every change
 * applies immediately and the view can be shared.
 */
export function FilterBar({
  fields,
  onChange,
  leading,
}: {
  fields: FilterField[];
  onChange: (key: string, value: string) => void;
  /** Always visible, before the filters (e.g. the period picker). */
  leading?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = fields.filter((f) => f.value);
  const labelOf = (f: FilterField) => f.options.find((o) => o.value === f.value)?.label ?? f.value;
  const clear = () => {
    for (const f of active) onChange(f.key, "");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {leading}
        {/* wide screens */}
        <div className="hidden flex-wrap items-center gap-3 sm:flex">
          {fields.map((f) => (
            <Select
              key={f.key}
              aria-label={f.label}
              value={f.value}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="w-auto"
            >
              <option value="">{f.allLabel}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
        {/* phones */}
        <Button variant="secondary" className="min-h-11 sm:hidden" onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" />
          تصفية
          {active.length > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-xs text-white dark:text-canvas">
              {active.length}
            </span>
          )}
        </Button>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 sm:hidden" aria-label="الفلاتر المفعّلة">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange(f.key, "")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-sm text-brand"
              aria-label={`إزالة ${f.label}: ${labelOf(f)}`}
            >
              {f.label}: {labelOf(f)}
              <X className="size-3.5" />
            </button>
          ))}
          <button type="button" onClick={clear} className="text-sm text-muted underline">
            مسح الكل
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen} title="تصفية">
        <div className="space-y-6">
          {fields.map((f) => (
            <fieldset key={f.key} className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{f.label}</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={f.label}>
                {[{ value: "", label: f.allLabel }, ...f.options].map((o) => {
                  const on = f.value === o.value;
                  return (
                    <button
                      key={o.value || "all"}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange(f.key, o.value)}
                      className={cx(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition",
                        on
                          ? "border-brand bg-brand text-white dark:text-canvas"
                          : "bg-surface text-ink hover:bg-brand-soft",
                      )}
                    >
                      {on && <Check className="size-4" />}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-6 flex gap-3 border-t pt-4">
          <Button className="min-h-11 flex-1" onClick={() => setOpen(false)}>
            عرض النتائج
          </Button>
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={clear}
            disabled={!active.length}
          >
            مسح
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
