import { Card, cx } from "./ui";

export type StatTone = "good" | "bad" | "warn";
const TONE: Record<StatTone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
};

/**
 * The one way a headline number looks across the platform: its label, the figure, an optional
 * line under it, and the change from the previous period. `cell` sits in a joined strip of tiles.
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  delta,
  as = "card",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  /** Change vs the previous period (▲▼ %). */
  delta?: { now: number; prev: number; label?: string; lowerIsBetter?: boolean };
  as?: "card" | "cell";
}) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cx(
          "mt-0.5 font-bold tabular-nums",
          as === "card" ? "text-xl" : "text-lg",
          tone && TONE[tone],
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      {delta && <Delta {...delta} />}
    </>
  );
  return as === "cell" ? (
    <li className="bg-surface p-3">{body}</li>
  ) : (
    <Card className="p-4">{body}</Card>
  );
}

function Delta({
  now,
  prev,
  label,
  lowerIsBetter,
}: {
  now: number;
  prev: number;
  label?: string;
  lowerIsBetter?: boolean;
}) {
  if (Math.abs(now - prev) < 0.005)
    return <p className="mt-1 text-xs text-muted">بلا تغيّر عن {label}</p>;
  const up = now > prev;
  const good = lowerIsBetter ? !up : up;
  const pct = prev !== 0 ? Math.abs(((now - prev) / Math.abs(prev)) * 100) : null;
  return (
    <p className={cx("mt-1 text-xs", good ? TONE.good : TONE.bad)}>
      {up ? "▲" : "▼"} {pct === null ? "جديد" : `${pct.toFixed(0)}%`} عن {label}
    </p>
  );
}
