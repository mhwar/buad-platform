import { day, sar } from "../../lib/format";
import type { Week } from "./api";

const shortDay = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  day: "numeric",
  month: "short",
});
const compact = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const label = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : shortDay.format(d);
};

/**
 * Weekly closing balance as bars (brand above zero, red below), each with its amount and the week
 * it ends, a zero line, and the full table behind it for screen readers and exact figures.
 */
export function ForecastChart({ weeks }: { weeks: Week[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.abs(w.balance)));
  const negative = weeks.some((w) => w.balance < 0);
  const H = 120; // px for the tallest bar on one side of zero
  return (
    <div>
      <figure
        aria-label="الرصيد المتوقع في نهاية كل أسبوع"
        className="rounded-xl border bg-surface p-3"
      >
        <div className="overflow-x-auto">
          <div className="flex min-w-[36rem] items-stretch gap-1.5">
            {weeks.map((w) => {
              const h = Math.max(2, Math.round((Math.abs(w.balance) / max) * H));
              const up = w.balance >= 0;
              return (
                <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center text-xs">
                  {/* above zero */}
                  <div
                    className="flex w-full flex-col items-center justify-end"
                    style={{ height: H + 18 }}
                  >
                    {up && (
                      <>
                        <span className="mb-0.5 tabular-nums text-muted">
                          {compact.format(w.balance)}
                        </span>
                        <div
                          className="w-full max-w-8 rounded-t bg-brand"
                          style={{ height: h }}
                          title={sar(w.balance)}
                        />
                      </>
                    )}
                  </div>
                  <div className="h-px w-full bg-slate-300 dark:bg-slate-600" />
                  {negative && (
                    <div className="flex w-full flex-col items-center" style={{ height: H + 18 }}>
                      {!up && (
                        <>
                          <div
                            className="w-full max-w-8 rounded-b bg-red-600"
                            style={{ height: h }}
                            title={sar(w.balance)}
                          />
                          <span className="mt-0.5 tabular-nums text-red-600">
                            {compact.format(w.balance)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  <span className="mt-1 whitespace-nowrap text-muted">
                    {label(w.end || w.start)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <figcaption className="mt-2 text-xs text-muted">
          الرصيد المتوقع في نهاية كل أسبوع، بالريال. التاريخ تحت كل عمود هو آخر يوم في الأسبوع.
        </figcaption>
      </figure>
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
                  <td className="p-2">
                    {day(w.start)}
                    {w.end && ` – ${day(w.end)}`}
                  </td>
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
