import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, Dialog, Notice } from "../../components/ui";
import { ok } from "../../lib/format";
import { send, teamUsersQuery } from "./queries";

/** Who works on a project: people listed here always see it, whatever their role's project scope. */
export function ProjectMembers({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const users = useQuery({ ...teamUsersQuery, enabled: open });
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    fetch(`/api/team/projects/${projectId}/members`)
      .then((r) => ok<{ userIds: string[] }>(r))
      .then((b) => setIds(b.userIds))
      .catch(() => setError("تعذّر تحميل الفريق."));
  }, [open, projectId]);
  const save = async () => {
    try {
      await send("PUT", `/api/team/projects/${projectId}/members`, { userIds: ids });
      onClose();
    } catch {
      setError("تعذّر الحفظ.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="فريق المشروع">
      <div className="space-y-3">
        {error && <Notice>{error}</Notice>}
        <p className="text-sm text-muted">
          من تحدّده هنا يرى هذا المشروع حتى لو كان دوره يقتصر على مشاريعه.
        </p>
        <ul className="space-y-1">
          {users.data
            ?.filter((u) => u.active && !u.pending)
            .map((u) => (
              <li key={u.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-brand)]"
                    checked={ids.includes(u.id)}
                    onChange={(e) =>
                      setIds(e.target.checked ? [...ids, u.id] : ids.filter((i) => i !== u.id))
                    }
                  />
                  <span className="flex-1">{u.name || u.email}</span>
                  <span className="text-xs text-muted">{u.roleName}</span>
                </label>
              </li>
            ))}
        </ul>
        <Button onClick={save} className="w-full">
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
