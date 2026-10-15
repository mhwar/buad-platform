import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, PageHeader, Pills } from "../../components/ui";
import { today } from "../../lib/format";
import { meQuery, useCan } from "../../session";
import { decisionsQuery } from "./api";
import { DecisionDialog } from "./DecisionDialog";
import { DecisionList } from "./DecisionList";

const route = getRouteApi("/decisions");
type Filter = "open" | "mine" | "late" | "done";

/** «القرارات»: what was decided, who carries it out and by when — until it is done. */
export function DecisionsPage() {
  const s = route.useSearch();
  const nav = route.useNavigate();
  const can = useCan();
  const q = useQuery(decisionsQuery());
  const [adding, setAdding] = useState(false);
  const filter: Filter = s.mine ? "mine" : (s.show ?? "open");
  const me = useQuery(meQuery).data;
  const all = q.data ?? [];
  const t = today();
  const pick = (f: Filter) =>
    all.filter((d) =>
      f === "done"
        ? d.status !== "open"
        : f === "late"
          ? d.status === "open" && !!d.dueDate && d.dueDate < t
          : f === "mine"
            ? d.status === "open" && d.ownerId === me?.id
            : d.status === "open",
    );
  const shown = pick(filter);
  return (
    <>
      <PageHeader
        title="القرارات"
        subtitle="ما تقرّر في الاجتماعات والمشاريع، ومن ينفّذه ومتى"
        actions={
          can("meetings.edit") && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> قرار
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Pills<Filter>
          value={filter}
          onChange={(v) =>
            nav({ search: v === "mine" ? { mine: "1" } : { show: v || undefined }, replace: true })
          }
          items={[
            { value: "open", label: "المفتوحة", count: pick("open").length },
            { value: "mine", label: "المسندة إليّ", count: pick("mine").length },
            { value: "late", label: "المتأخرة", count: pick("late").length },
            { value: "done", label: "المنتهية", count: pick("done").length },
          ]}
        />
      </div>
      {q.isPending ? (
        <Card className="h-32 animate-pulse" aria-busy />
      ) : shown.length === 0 ? (
        <EmptyState
          title={all.length ? "لا قرارات هنا" : "لا قرارات بعد"}
          text={all.length ? undefined : "سجّل قرارات الاجتماع في محضره، أو أضف قراراً مباشرة."}
        />
      ) : (
        <DecisionList items={shown} />
      )}
      {adding && <DecisionDialog onClose={() => setAdding(false)} />}
    </>
  );
}
