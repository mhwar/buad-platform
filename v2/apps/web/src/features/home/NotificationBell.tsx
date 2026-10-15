import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../components/ui";
import { ago } from "../../lib/format";
import { notificationsQuery } from "./api";

/** The bell in the header: unread count, and a sheet with the latest notifications. */
export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery(notificationsQuery);
  const unread = q.data?.unread ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
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
        aria-label={unread ? `التنبيهات، ${unread} غير مقروءة` : "التنبيهات"}
        className={`relative inline-flex size-11 items-center justify-center rounded-full ${
          onDark
            ? "text-white/85 hover:bg-white/10 hover:text-white"
            : "text-muted hover:bg-brand-soft hover:text-ink"
        }`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute end-1.5 top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="التنبيهات">
        {q.data?.items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">لا تنبيهات بعد.</p>
        )}
        <ul className="space-y-1">
          {q.data?.items.map((n) => (
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
        {unread > 0 && (
          <button
            type="button"
            className="mt-3 text-sm text-brand underline"
            onClick={async () => {
              await fetch("/api/notifications/read-all", { method: "POST" });
              refresh();
            }}
          >
            تعليم الكل كمقروء
          </button>
        )}
      </Dialog>
    </>
  );
}
