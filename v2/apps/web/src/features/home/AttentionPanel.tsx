import { useQuery } from "@tanstack/react-query";
import { Check, Circle } from "lucide-react";
import { Badge, Card } from "../../components/ui";
import { attentionQuery } from "./api";

/** «ما يحتاج انتباهك اليوم» and the setup checklist. Renders nothing when there is nothing to say. */
export function AttentionPanel() {
  const q = useQuery(attentionQuery);
  const items = q.data?.items ?? [];
  const checklist = q.data?.checklist ?? [];
  if (!items.length && !checklist.length) return null;
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-2">
      {items.length > 0 && (
        <Card aria-label="ما يحتاج انتباهك اليوم">
          <h2 className="mb-3 font-semibold">ما يحتاج انتباهك اليوم</h2>
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.key}>
                <a
                  href={i.link}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 hover:bg-brand-soft"
                >
                  <span className="text-sm">{i.title}</span>
                  <Badge tone={i.tone === "warn" ? "amber" : "blue"}>{i.count}</Badge>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {checklist.length > 0 && (
        <Card aria-label="خطوات الإعداد">
          <h2 className="mb-1 font-semibold">خطوات إعداد المنصة</h2>
          <p className="mb-3 text-xs text-muted">
            أنجزت {done} من {checklist.length}. تختفي القائمة عند اكتمالها.
          </p>
          <ul className="space-y-1">
            {checklist.map((c) => (
              <li key={c.key}>
                <a
                  href={c.link}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-brand-soft"
                >
                  {c.done ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Circle className="size-4 text-muted" />
                  )}
                  <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
