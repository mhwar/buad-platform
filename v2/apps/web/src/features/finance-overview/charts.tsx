import { useState } from "react";
import { sar } from "../../lib/format";

const monthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  month: "short",
  year: "2-digit",
});
export const monthLabel = (m: string) => monthFmt.format(new Date(`${m}-01T00:00:00Z`));

/** Round up to a tidy axis maximum (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
const compact = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const SERIES = [
  { key: "income", label: "الإيرادات", color: "var(--color-series-1)" },
  { key: "expense", label: "المصروفات", color: "var(--color-series-2)" },
] as const;

function Legend() {
  return (
    <div className="flex gap-4 text-xs text-muted">
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Income vs expense per month: grouped bars, one axis, time flowing right→left (reading
 * direction). Hovering a month shows both values; a table view lists every number.
 */
export function MonthlyBars({
  data,
}: {
  data: { month: string; income: number; expense: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (data.length === 0)
    return <p className="py-10 text-center text-sm text-muted">لا توجد قيود في هذه الفترة.</p>;
  const W = 640;
  const H = 220;
  const pad = { top: 12, bottom: 28, left: 8, right: 44 };
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense))));
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const slot = plotW / data.length;
  const bar = Math.max(4, Math.min(22, (slot - 10) / 2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  // Right-to-left: the first month sits at the right edge.
  const xSlot = (i: number) => pad.left + plotW - (i + 1) * slot;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Legend />
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="text-xs text-muted underline hover:text-ink"
        >
          {table ? "عرض كرسم" : "عرض كجدول"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="p-1.5 text-right font-medium">الشهر</th>
              <th className="p-1.5 text-right font-medium">الإيرادات</th>
              <th className="p-1.5 text-right font-medium">المصروفات</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t">
                <td className="p-1.5">{monthLabel(d.month)}</td>
                <td className="p-1.5">{sar(d.income)}</td>
                <td className="p-1.5">{sar(d.expense)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-label="الإيرادات والمصروفات لكل شهر"
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={W - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
                <text
                  x={W - pad.right + 6}
                  y={y(t) + 4}
                  fontSize={10}
                  fill="var(--color-muted)"
                  textAnchor="start"
                >
                  {compact.format(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = xSlot(i) + slot / 2;
              return (
                <g key={d.month}>
                  {hover === i && (
                    <rect
                      x={xSlot(i)}
                      y={pad.top}
                      width={slot}
                      height={plotH}
                      fill="var(--color-brand-soft)"
                      opacity={0.6}
                    />
                  )}
                  {SERIES.map((s, k) => {
                    const v = d[s.key];
                    const top = y(v);
                    const hgt = Math.max(0, pad.top + plotH - top);
                    // Income on the right of the pair (reading direction), 2px gap between.
                    const x = k === 0 ? cx + 1 : cx - 1 - bar;
                    return (
                      <path
                        key={s.key}
                        d={roundedTop(x, top, bar, hgt, Math.min(4, hgt))}
                        fill={s.color}
                      />
                    );
                  })}
                  <text
                    x={cx}
                    y={H - 8}
                    fontSize={10}
                    fill="var(--color-muted)"
                    textAnchor="middle"
                  >
                    {monthLabel(d.month)}
                  </text>
                  {/* Hit area larger than the bars. */}
                  <rect
                    x={xSlot(i)}
                    y={pad.top}
                    width={slot}
                    height={plotH + pad.bottom}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    tabIndex={0}
                    aria-label={`${monthLabel(d.month)}: إيرادات ${sar(d.income)}، مصروفات ${sar(d.expense)}`}
                  />
                </g>
              );
            })}
          </svg>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 rounded-lg border bg-surface px-3 py-2 text-xs shadow-md"
              style={{
                right: `${Math.min(70, ((hover + 0.5) * slot + pad.right) / (W / 100))}%`,
              }}
            >
              <p className="mb-1 font-semibold">{monthLabel(h.month)}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ background: s.color }}
                  />
                  {s.label}: <b>{sar(h[s.key])}</b>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A bar with 4px rounded top corners, anchored flat on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Ranked horizontal bars (one series): label, bar, value. */
export function RankBars({
  data,
  color = "var(--color-series-1)",
  format = sar,
}: {
  data: { label: string; amount: number; href?: string }[];
  color?: string;
  format?: (v: number) => string;
}) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-muted">لا بيانات.</p>;
  const max = Math.max(...data.map((d) => d.amount), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="text-sm" title={`${d.label}: ${format(d.amount)}`}>
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate">{d.label}</span>
            <span className="shrink-0 font-semibold">{format(d.amount)}</span>
          </div>
          <div className="h-2 rounded-full bg-brand-soft/60">
            <div
              className="h-2 rounded-full"
              style={{ width: `${Math.max(2, (d.amount / max) * 100)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
