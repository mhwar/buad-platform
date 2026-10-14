import { Card } from "../../components/ui";

/** A headline number with its label and an optional line under it. */
export function Tile({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
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
    </Card>
  );
}
