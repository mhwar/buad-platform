import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, Segmented } from "../../components/ui";
import { ago } from "../../lib/format";
import { attentionQuery, type Notice, notificationsQuery } from "./api";

/** What a notification is about, by its kind — the sheet groups them so a busy day reads at a glance. */
const GROUPS: { key: string; label: string; kinds: string[] }[] = [
  { key: "tasks", label: "المهام", kinds: ["task"] },
  { key: "meetings", label: "الاجتماعات والقرارات", kinds: ["meeting", "decision"] },
  { key: "sales", label: "العملاء والمبيعات", kinds: ["client", "request"] },
  { key: "docs", label: "المستندات والاعتمادات", kinds: ["document", "contract", "approval"] },
  { key: "projects", label: "المشاريع", kinds: ["project"] },
  { key: "finance", label: "المالية", kinds: ["finance", "receipt"] },
  { key: "plans", label: "التخطيط", kinds: ["strategic", "operational"] },
];
/** Groups in a fixed order, the newest first inside each; kinds not listed fall under «أخرى». */
export function groupNotices(items: Notice[]) {
  const known = new Set(GROUPS.flatMap((g) => g.kinds));
  return [
    ...GROUPS.map((g) => ({ ...g, items: items.filter((n) => g.kinds.includes(n.kind)) })),
    { key: "other", label: "أخرى", kinds: [], items: items.filter((n) => !known.has(n.kind)) },
  ].filter((g) => g.items.length);
}

/** The bell in the header: unread count, and a sheet with the latest notifications. */
export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery(notificationsQuery);
  const unread = q.data?.unread ?? 0;
  // What needs doing now (overdue instalments, approvals waiting…) belongs here too, so the bell
  // never says «nothing» while the menu shows red counts.
  const attention = useQuery(attentionQuery).data?.items.filter((i) => i.count > 0) ?? [];
  const urgent = attention.filter((i) => i.tone === "warn").length;
  const badge = unread + urgent;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const [only, setOnly] = useState<"all" | "unread">("all");
  const shown = (q.data?.items ?? []).filter((n) => only === "all" || !n.readAt);
  const groups = groupNotices(shown);
  const go = async (n: { id: string; link: string; readAt: number }) => {
    if (!n.readAt) await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    refresh();
    setOpen(false);
    if (n.link) window.location.assign(n.link);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={badge ? `التنبيهات، ${badge} تحتاج انتباهك` : "التنبيهات"}
        className={`relative inline-flex size-11 items-center justify-center rounded-full ${
          onDark
            ? "text-white/85 hover:bg-white/10 hover:text-white"
            : "text-muted hover:bg-brand-soft hover:text-ink"
        }`}
      >
        <Bell className="size-5" />
        {badge > 0 && (
          <span className="absolute end-1 top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold leading-5 text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="التنبيهات">
        {attention.length > 0 && (
          <section aria-label="يحتاج انتباهك" className="mb-4 space-y-1">
            <h3 className="px-1 text-xs font-semibold text-muted">يحتاج انتباهك</h3>
            <ul className="space-y-1">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link
                    to={a.link as never}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-brand-soft"
                  >
                    <span>{a.title}</span>
                    <span
                      className={`min-w-6 rounded-full px-2 text-center text-xs font-bold ${a.tone === "warn" ? "bg-red-600 text-white" : "bg-brand-soft text-brand"}`}
                    >
                      {a.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="عرض التنبيهات"
            value={only}
            onChange={setOnly}
            items={[
              { value: "all", label: "الكل" },
              { value: "unread", label: `غير المقروءة (${unread})` },
            ]}
          />
          {unread > 0 && (
            <Button
              variant="ghost"
              onClick={async () => {
                await fetch("/api/notifications/read-all", { method: "POST" });
                refresh();
              }}
            >
              <CheckCheck className="size-4" />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>
        {q.data && shown.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            {only === "unread" ? "قرأت كل شيء ✓" : "لا تنبيهات بعد."}
          </p>
        )}
        {groups.map((g) => {
          const fresh = g.items.filter((n) => !n.readAt);
          return (
            <section key={g.key} aria-label={g.label} className="mb-3">
              <header className="mb-1 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-muted">
                  {g.label} <span className="font-normal">({g.items.length})</span>
                </h3>
                {fresh.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-brand hover:underline"
                    onClick={async () => {
                      await Promise.all(
                        fresh.map((n) =>
                          fetch(`/api/notifications/${n.id}/read`, { method: "POST" }),
                        ),
                      );
                      refresh();
                    }}
                  >
                    تعليم كمقروء
                  </button>
                )}
              </header>
              <ul className="space-y-1">
                {g.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => go(n)}
                      className="flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2 text-start hover:bg-brand-soft"
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.readAt ? "" : "font-semibold"}`}>
                          {n.title}
                        </span>
                        <span className="text-xs text-muted">{ago(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Dialog>
    </>
  );
}
