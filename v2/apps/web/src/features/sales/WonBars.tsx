import { sar } from "../../lib/format";

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** Value won per month: hand-drawn bars (oldest on the right in Arabic), with a table for screen readers. */
export function WonBars({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = 100 / Math.max(1, data.length);
  const empty = data.every((d) => d.value === 0);
  return (
    <div>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted">لا مكاسب مسجّلة في آخر 12 شهراً.</p>
      ) : (
        <svg
          viewBox="0 0 100 50"
          preserveAspectRatio="none"
          role="img"
          aria-label="قيمة المكسوب شهرياً"
          className="h-40 w-full rounded-xl border bg-surface"
          style={{ transform: "scaleX(-1)" }}
        >
          {data.map((d, i) => {
            const h = (d.value / max) * 44;
            return (
              <rect
                key={d.month}
                x={i * bw + bw * 0.15}
                y={48 - h}
                width={bw * 0.7}
                height={Math.max(h, d.value ? 0.6 : 0)}
                rx="0.6"
                fill="var(--color-series-1)"
              >
                <title>{`${MONTHS[Number(d.month.slice(5)) - 1]} ${d.month.slice(0, 4)}: ${sar(d.value)}`}</title>
              </rect>
            );
          })}
        </svg>
      )}
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-brand">عرض الجدول</summary>
        <table className="w-full text-sm">
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t">
                <td className="p-2">
                  {MONTHS[Number(d.month.slice(5)) - 1]} {d.month.slice(0, 4)}
                </td>
                <td className="p-2 text-end tabular-nums">{sar(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
