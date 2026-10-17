import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { ok } from "../../lib/format";

type Check = {
  key: string;
  title: string;
  hint: string;
  rows: { label: string; detail: string; link: string }[];
};

export const financeChecksQuery = {
  queryKey: ["finance-overview", "checks"],
  queryFn: async () => (await ok<{ checks: Check[] }>(await fetch("/api/finance/checks"))).checks,
};

/**
 * «تحتاج تدخلك»: figures that look wrong (an unapproved or duplicate receipt, shares not 100%,
 * tax paid booked as a cost…). Nothing is fixed for you: each line opens where it is fixed.
 */
export function FinanceChecks() {
  const q = useQuery(financeChecksQuery);
  const checks = q.data ?? [];
  if (!checks.length) return null;
  const total = checks.reduce((s, c) => s + c.rows.length, 0);
  return (
    <details
      className="group mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
      aria-label="تحتاج تدخلك"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-5 shrink-0" />
        تحتاج تدخلك: {total} {total === 1 ? "ملاحظة" : "ملاحظات"} على الأرقام
        <ChevronDown className="ms-auto size-4 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-4">
        {checks.map((c) => (
          <section key={c.key} aria-label={c.title}>
            <h3 className="text-sm font-semibold">
              {c.title} ({c.rows.length})
            </h3>
            <p className="mb-1.5 text-xs text-muted">{c.hint}</p>
            <ul className="space-y-1 text-sm">
              {c.rows.map((r) => (
                <li key={`${r.label}-${r.detail}`}>
                  <Link
                    to={r.link.split("?")[0] as "/"}
                    search={
                      Object.fromEntries(new URLSearchParams(r.link.split("?")[1] ?? "")) as never
                    }
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    {r.label}
                  </Link>
                  <span className="text-muted"> — {r.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
