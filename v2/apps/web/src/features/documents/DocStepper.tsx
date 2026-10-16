import { Check } from "lucide-react";
import { cx } from "../../components/ui";
import { fromEpoch } from "../../lib/format";
import { type DocDetail, waitingLabel } from "./api";

const STEPS = ["draft", "review", "approved", "outgoing"] as const;
const LABEL = { draft: "مسودة", review: "مراجعة", approved: "معتمد", outgoing: "صادر" } as const;

/**
 * Where a contract or letter stands on its way out: مسودة ← مراجعة ← معتمد ← صادر, with when
 * it reached each step it has passed and how long it has waited in review.
 */
export function DocStepper({ doc }: { doc: DocDetail["document"] }) {
  const at = doc.outgoingNo ? 3 : STEPS.indexOf(doc.status);
  const when: Partial<Record<(typeof STEPS)[number], string>> = {
    review: doc.status === "review" ? waitingLabel(doc).replace("بانتظار الاعتماد ", "") : "",
    approved: doc.approvedAt && at >= 2 ? fromEpoch(doc.approvedAt) : "",
    outgoing: doc.outgoingAt ? fromEpoch(doc.outgoingAt) : "",
  };
  return (
    <ol
      aria-label="مراحل المستند"
      className="mb-4 flex overflow-x-auto rounded-xl border bg-surface p-1 print:hidden"
    >
      {STEPS.map((s, i) => {
        const current = i === at;
        const past = i < at;
        return (
          <li
            key={s}
            aria-current={current ? "step" : undefined}
            className={cx(
              "flex min-h-11 min-w-[6.5rem] flex-1 flex-col items-center justify-center rounded-lg px-2 py-1 text-sm",
              current
                ? s === "review"
                  ? "bg-amber-500 font-semibold text-white"
                  : "bg-brand font-semibold text-white dark:text-canvas"
                : past
                  ? "text-brand"
                  : "text-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              {past && <Check className="size-3.5" />}
              {LABEL[s]}
            </span>
            {when[s] && (past || current) && (
              <span className={cx("text-[11px]", current ? "opacity-90" : "text-muted")}>
                {when[s]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
