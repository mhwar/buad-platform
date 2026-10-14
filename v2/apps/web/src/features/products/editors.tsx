import type { ContentItem } from "@buad/schema/products";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Field, Input, Select, Textarea } from "../../components/ui";
import { ICON_LABEL } from "./icons";

/** Small, generic editors the product builder is made of. */

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

/** One text line per row. Blank lines are dropped when the product is saved. */
export function LinesField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint ?? "سطر لكل بند"}>
      <Textarea
        rows={rows}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </Field>
  );
}

export function Repeater<T>({
  items,
  onChange,
  make,
  render,
  addLabel,
  max = 12,
  emptyText,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  make: () => T;
  render: (item: T, set: (patch: Partial<T>) => void, i: number) => ReactNode;
  addLabel: string;
  max?: number;
  emptyText?: string;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as T, next[i] as T];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.length === 0 && emptyText && <p className="text-sm text-muted">{emptyText}</p>}
      {items.map((it, i) => (
        <div key={i} className="rounded-xl border bg-canvas/40 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">{i + 1}</span>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="للأعلى"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                aria-label="للأسفل"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                aria-label="حذف"
                onClick={() => onChange(items.filter((_, k) => k !== i))}
                className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {render(
              it,
              (patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))),
              i,
            )}
          </div>
        </div>
      ))}
      {items.length < max && (
        <Button variant="secondary" onClick={() => onChange([...items, make()])}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

type IconName = ContentItem["icon"];
export function IconSelect({
  value,
  onChange,
}: {
  value?: IconName;
  onChange: (v: IconName) => void;
}) {
  return (
    <Field label="الأيقونة">
      <Select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as IconName)}
      >
        <option value="">بدون</option>
        {Object.entries(ICON_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );
}

type TitleText = ContentItem;

/** Title + text (+ icon) cards: problems, benefits, process stages, standards, deliverables. */
export function TitleTextList({
  items,
  onChange,
  addLabel,
  icons = true,
  max = 8,
}: {
  items: TitleText[];
  onChange: (v: TitleText[]) => void;
  addLabel: string;
  icons?: boolean;
  max?: number;
}) {
  return (
    <Repeater
      items={items}
      onChange={onChange}
      max={max}
      addLabel={addLabel}
      make={() => ({ title: "", text: "" }) as TitleText}
      render={(it, set) => (
        <>
          <Field label="العنوان">
            <Input value={it.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          {icons ? <IconSelect value={it.icon} onChange={(icon) => set({ icon })} /> : <div />}
          <Field label="الوصف" className="sm:col-span-2">
            <Textarea rows={2} value={it.text} onChange={(e) => set({ text: e.target.value })} />
          </Field>
        </>
      )}
    />
  );
}
