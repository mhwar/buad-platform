import { Card } from "../../components/ui";

/** A headline number with its label and an optional line under it. */
export function Tile({
  title,
  value,
  sub,
  tone,
  delta,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
  /** Change vs the previous period (▲▼ %). */
  delta?: { now: number; prev: number; label?: string; lowerIsBetter?: boolean };
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{title}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          tone === "good"
            ? "text-emerald-700 dark:text-emerald-400"
            : tone === "bad"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      {delta && <Delta {...delta} />}
    </Card>
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
    <p
      className={`mt-1 text-xs ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
    >
      {up ? "▲" : "▼"} {pct === null ? "جديد" : `${pct.toFixed(0)}%`} عن {label}
    </p>
  );
}
