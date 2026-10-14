import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Card, EmptyState } from "../../components/ui";
import { MORE_TABS } from "./tabs";

/** Body of a «قريباً» tab: what it will hold. No sample numbers: nothing here is real yet. */
export function ComingSoon({ tabKey }: { tabKey: string }) {
  const tab = MORE_TABS.find((t) => t.key === tabKey && t.soon);
  if (!tab)
    return (
      <EmptyState
        title="هذا القسم غير موجود"
        action={
          <Link to="/more" className="text-brand underline">
            العودة إلى المزيد
          </Link>
        }
      />
    );
  return (
    <Card>
      <p className="mb-3 font-semibold">ما الذي سيحتويه</p>
      <ul className="space-y-2">
        {tab.will?.map((w) => (
          <li key={w} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-brand" />
            {w}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        نعمل على هذا القسم ضمن خطة التطوير. سيظهر هنا فور جاهزيته.
      </p>
    </Card>
  );
}
