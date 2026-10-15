import { STAGE_LABEL } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import { sar } from "../../lib/format";
import { useCan } from "../../session";
import { requestsQuery } from "../products/products-api";
import { NewOpportunityDialog } from "./NewOpportunityDialog";

/** A client's opportunities, each opening its own page, and a new one for this client. */
export function ClientOpportunities({ clientId }: { clientId: string }) {
  const can = useCan();
  const view = can("sales.view");
  const q = useQuery({ ...requestsQuery(""), enabled: view });
  const [adding, setAdding] = useState(false);
  if (!view) return null;
  const mine = (q.data?.requests ?? []).filter((r) => r.clientId === clientId);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">فرص البيع ({mine.length})</h2>
        {can("sales.edit") && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            فرصة لهذا العميل
          </Button>
        )}
      </div>
      {mine.length === 0 ? (
        <p className="text-sm text-muted">لا فرص بعد لهذا العميل.</p>
      ) : (
        <ul className="divide-y text-sm">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <Link
                to="/sales/$id"
                params={{ id: r.id }}
                className="min-w-0 truncate font-medium hover:text-brand hover:underline"
              >
                {r.productName || "فرصة"} · {r.name}
              </Link>
              <span className="flex shrink-0 items-center gap-1.5">
                {r.value > 0 && <span className="text-xs text-muted">{sar(r.value)}</span>}
                <Badge tone={r.status === "won" ? "green" : r.status === "lost" ? "gray" : "blue"}>
                  {STAGE_LABEL[r.status]}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      <NewOpportunityDialog open={adding} onClose={() => setAdding(false)} clientId={clientId} />
    </Card>
  );
}
