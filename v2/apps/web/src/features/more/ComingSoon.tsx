import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Card, EmptyState, PageHeader } from "../../components/ui";
import { SOON_TOOLS, soonToolOf } from "./tabs";

/** «قريباً»: every tool on the way, with what it will do. Nothing here is real data yet. */
export function SoonPage() {
  return (
    <div>
      <PageHeader title="قريباً" subtitle="أدوات نعمل عليها. تظهر هنا فور جاهزيتها." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOON_TOOLS.map((t) => (
          <Link key={t.key} to="/more/soon/$key" params={{ key: t.key }} className="block">
            <Card className="h-full p-4 transition hover:border-brand">
              <div className="flex items-center gap-2">
                <t.icon className="size-5 text-brand" />
                <p className="font-semibold">{t.label}</p>
              </div>
              <p className="mt-2 text-sm text-muted">{t.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One tool on the way: what it will contain and when it will matter. */
export function ComingSoon({ tabKey }: { tabKey: string }) {
  const tool = soonToolOf(tabKey);
  if (!tool)
    return (
      <EmptyState
        title="هذا القسم غير موجود"
        action={
          <Link to="/soon" className="text-brand underline">
            العودة إلى «قريباً»
          </Link>
        }
      />
    );
  return (
    <div>
      <Link to="/soon" className="text-sm text-muted hover:text-ink">
        ← قريباً
      </Link>
      <PageHeader title={tool.label} subtitle={tool.desc} />
      <Card>
        <p className="mb-3 font-semibold">ما الذي سيحتويه</p>
        <ul className="space-y-2">
          {tool.will.map((w) => (
            <li key={w} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" />
              {w}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">متى تستخدمه: {tool.when}</p>
      </Card>
    </div>
  );
}
