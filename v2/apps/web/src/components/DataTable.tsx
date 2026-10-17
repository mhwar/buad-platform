import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cx } from "./ui";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the header a sort button; numbers sort high-first on the first click. */
  sort?: (row: T) => number | string;
  /** Amounts, counts, dates: aligned to one edge with even digit widths. */
  numeric?: boolean;
  /** Shown as the card's title on a phone (one column). */
  primary?: boolean;
  /** Left out of the phone card (secondary detail). */
  hideOnCard?: boolean;
};

/**
 * One table for the platform: headers that sort with a tap (announced to screen readers), numbers
 * lined up on one edge, comfortable 44px rows — and on a phone, a card per row (title + the key
 * figures) instead of a squeezed table.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  initialSort,
  cardFields = 3,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Read by screen readers; not shown. */
  caption: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** How many figures each phone card shows under its title. */
  cardFields?: number;
  /** A totals row (desktop) / line (phone). */
  footer?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted =
    col?.sort && sort
      ? [...rows].sort((a, b) => {
          const x = col.sort!(a);
          const y = col.sort!(b);
          const d =
            typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x).localeCompare(String(y), "ar");
          return sort.dir === "asc" ? d : -d;
        })
      : rows;
  const toggle = (c: Column<T>) =>
    setSort((s) =>
      s?.key === c.key
        ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: c.key, dir: c.numeric ? "desc" : "asc" },
    );
  const title = (columns.find((c) => c.primary) ?? columns[0]) as Column<T>;
  const figures = columns.filter((c) => c !== title && !c.hideOnCard).slice(0, cardFields);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-y bg-canvas/60 text-xs text-muted">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : c.sort
                          ? "none"
                          : undefined
                    }
                    className={cx(
                      "px-3 py-2.5 font-medium whitespace-nowrap",
                      c.numeric ? "text-end" : "text-start",
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={cx(
                          "inline-flex items-center gap-1 rounded hover:text-ink",
                          active && "text-ink",
                          c.numeric && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={rowKey(r)} className="h-11 border-b last:border-0 hover:bg-brand-soft/40">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      "px-3 py-2.5",
                      c.numeric && "text-end whitespace-nowrap tabular-nums",
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="border-t font-semibold">{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y md:hidden" aria-label={caption}>
        {sorted.map((r) => (
          <li key={rowKey(r)} className="space-y-2 px-4 py-3">
            <div className="min-w-0">{title.cell(r)}</div>
            {figures.length > 0 && (
              <dl className="grid grid-cols-3 gap-2">
                {figures.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted">{c.header}</dt>
                    <dd className={cx("truncate text-sm font-medium", c.numeric && "tabular-nums")}>
                      {c.cell(r)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
