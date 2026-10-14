import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, FilePlus2, FileSpreadsheet, Pencil, ReceiptText } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, Dialog, type MenuItem, Notice, Select } from "../../components/ui";
import { financeQuery } from "../finance/api";
import { EntryDialog } from "../finance/EntryDialog";
import { projectKeys } from "../projects/api";
import { ProjectDialog } from "../projects/ProjectDialog";
import { archiveClient, clientKeys, clientQuery } from "./api";
import { ClientDialog } from "./ClientDialog";

type Mode = null | "project" | "entry" | "edit";

/**
 * The actions a client offers wherever it appears (card ⋯ menu, client page):
 * new project, add a finance entry to one of its projects, statement of account, edit, archive.
 */
export function useClientActions({
  id,
  name,
  archived,
  manager,
  hasProjects,
}: {
  id: string;
  name: string;
  archived: boolean;
  manager: boolean;
  hasProjects: boolean;
}): { items: MenuItem[]; dialogs: ReactNode } {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(null);
  const close = () => setMode(null);

  const statement: MenuItem = {
    label: "كشف حساب",
    hint: "طباعة أو تصدير Excel",
    icon: <FileSpreadsheet />,
    onSelect: () => navigate({ to: "/clients/$id/statement", params: { id } }),
  };
  const items: MenuItem[] =
    manager && !archived
      ? [
          { section: "إجراءات سريعة" },
          {
            label: "مشروع جديد لهذا العميل",
            icon: <FilePlus2 />,
            onSelect: () => setMode("project"),
          },
          {
            label: "إضافة قيد مالي",
            hint: hasProjects ? "لأحد مشاريع العميل" : "أضيفوا مشروعاً أولاً",
            icon: <ReceiptText />,
            disabled: !hasProjects,
            onSelect: () => setMode("entry"),
          },
          statement,
          "separator",
          { label: "تعديل بيانات العميل", icon: <Pencil />, onSelect: () => setMode("edit") },
          {
            label: "أرشفة العميل ومشاريعه",
            icon: <Archive />,
            danger: true,
            onSelect: async () => {
              if (!confirm(`أرشفة «${name}» ومشاريعه؟ يمكن استعادتها لاحقاً.`)) return;
              await archiveClient(id);
              await Promise.all([
                qc.invalidateQueries({ queryKey: clientKeys.all }),
                qc.invalidateQueries({ queryKey: projectKeys.all }),
              ]);
            },
          },
        ]
      : [statement];

  const dialogs = (
    <>
      {mode === "project" && <ProjectDialog open onOpenChange={close} clientId={id} />}
      {mode === "edit" && <EditClient id={id} onClose={close} />}
      {mode === "entry" && <AddEntry clientId={id} clientName={name} onClose={close} />}
    </>
  );
  return { items, dialogs };
}

function EditClient({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery(clientQuery(id));
  if (!q.data) return null;
  return <ClientDialog open onOpenChange={(v) => !v && onClose()} existing={q.data} />;
}

/** Pick one of the client's live projects, then the usual entry dialog of that project. */
export function AddEntry({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const q = useQuery(clientQuery(clientId));
  const live = (q.data?.projects ?? []).filter((p) => !p.archivedAt);
  const [picked, setPicked] = useState("");
  const [chosen, setChosen] = useState("");
  const projectId = chosen || (live.length === 1 ? (live[0]?.id ?? "") : "");
  const fin = useQuery({ ...financeQuery(projectId), enabled: !!projectId });

  if (projectId && fin.data)
    return (
      <EntryDialog
        open
        onOpenChange={(v) => !v && onClose()}
        projectId={projectId}
        fin={fin.data}
        projectName={live.find((p) => p.id === projectId)?.name}
      />
    );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={`إضافة قيد · ${clientName}`}>
      {q.isPending || (projectId && fin.isPending) ? (
        <p className="text-muted">جارٍ التحميل…</p>
      ) : fin.isError ? (
        <Notice>تعذّر تحميل مالية المشروع</Notice>
      ) : live.length === 0 ? (
        <Notice tone="amber">لا توجد مشاريع حالية لهذا العميل.</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked) setChosen(picked);
          }}
        >
          <label className="block text-sm font-medium" htmlFor="entry-project">
            المشروع
          </label>
          <Select
            id="entry-project"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            required
          >
            <option value="">اختاروا المشروع…</option>
            {live.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.number}
              </option>
            ))}
          </Select>
          <div className="flex justify-end">
            <Button type="submit" disabled={!picked}>
              متابعة
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
