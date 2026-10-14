import { sar } from "../../lib/format";
import type { Week } from "./api";

/**
 * Weekly closing balance as bars (blue above zero, red below) with the table behind it for screen
 * readers. Hand-drawn SVG: 13 bars need no charting library.
 */
export function ForecastChart({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.abs(w.balance)));
  const H = 120;
  const mid = weeks.some((w) => w.balance < 0) ? H / 2 : H;
  const scale = (mid === H ? H : H / 2) / max;
  const bw = 100 / weeks.length;
  return (
    <div>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full rounded-xl border bg-surface"
        role="img"
        aria-label="الرصيد المتوقع في نهاية كل أسبوع"
        style={{ transform: "scaleX(-1)" }}
      >
        <line
          x1="0"
          x2="100"
          y1={mid}
          y2={mid}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="0.3"
        />
        {weeks.map((w, i) => {
          const h = Math.abs(w.balance) * scale;
          return (
            <rect
              key={w.start}
              x={i * bw + bw * 0.15}
              width={bw * 0.7}
              y={w.balance >= 0 ? mid - h : mid}
              height={Math.max(h, 0.4)}
              rx="0.6"
              fill={w.balance >= 0 ? "var(--color-brand)" : "#dc2626"}
            >
              <title>{`${w.start}: ${sar(w.balance)}`}</title>
            </rect>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-brand">عرض الجدول</summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-muted">
                <th className="p-2 text-start">الأسبوع</th>
                <th className="p-2 text-end">داخل</th>
                <th className="p-2 text-end">خارج</th>
                <th className="p-2 text-end">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.start} className="border-t">
                  <td className="p-2">{w.start}</td>
                  <td className="p-2 text-end tabular-nums">{sar(w.inflow)}</td>
                  <td className="p-2 text-end tabular-nums">{sar(w.outflow)}</td>
                  <td
                    className={`p-2 text-end tabular-nums ${w.balance < 0 ? "text-red-600" : ""}`}
                  >
                    {sar(w.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
