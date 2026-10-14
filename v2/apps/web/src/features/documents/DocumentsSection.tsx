import { DOC_KIND_LABELS, DOC_STATUS_LABELS } from "@buad/schema/documents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileSignature, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Dialog, Notice, type Tone } from "../../components/ui";
import { fromEpoch } from "../../lib/format";
import { docApi, docKeys, documentsQuery, templatesQuery } from "./api";

export const STATUS_TONE: Record<string, Tone> = {
  draft: "gray",
  review: "amber",
  approved: "green",
};

/** «المستندات» section of a project: its contracts and letters, newest first. */
export function DocumentsSection({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const q = useQuery(documentsQuery(projectId));
  const [creating, setCreating] = useState(false);
  const items = q.data ?? [];
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="font-semibold">العقود والخطابات</h2>
        {canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> مستند جديد
          </Button>
        )}
      </div>
      {q.isPending ? (
        <div className="m-5 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : items.length === 0 ? (
        <div className="px-5 pb-10 pt-6 text-center">
          <p className="text-sm text-muted">لا توجد مستندات لهذا المشروع بعد.</p>
          {canEdit && (
            <p className="mt-1 text-xs text-muted">
              العقد يُنشأ معبأً تلقائياً من بيانات الجهة والعميل والمشروع والمالية.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-4 divide-y border-t">
          {items.map((d) => (
            <li key={d.id}>
              <Link
                to="/projects/$id/documents/$docId"
                params={{ id: projectId, docId: d.id }}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-brand-soft/50"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  {d.kind === "contract" ? (
                    <FileSignature className="size-4" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {d.title || DOC_KIND_LABELS[d.kind]}
                  </span>
                  <span className="text-xs text-muted">
                    {DOC_KIND_LABELS[d.kind]} · <span dir="ltr">{d.number}</span> ·{" "}
                    {fromEpoch(d.updatedAt)}
                  </span>
                </span>
                {d.outgoingNo && (
                  <span className="hidden text-xs text-brand sm:inline">{d.outgoingNo}</span>
                )}
                <Badge tone={STATUS_TONE[d.status]}>{DOC_STATUS_LABELS[d.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewDocumentDialog projectId={projectId} onClose={() => setCreating(false)} />}
    </Card>
  );
}

function NewDocumentDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const t = useQuery(templatesQuery);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async (kind: "contract" | "letter", template: string) => {
    setBusy(template);
    setError(null);
    try {
      const r = await docApi.create(projectId, { kind, template });
      await qc.invalidateQueries({ queryKey: docKeys.list(projectId) });
      await navigate({
        to: "/projects/$id/documents/$docId",
        params: { id: projectId, docId: r.id },
      });
    } catch {
      setError("تعذّر إنشاء المستند");
      setBusy(null);
    }
  };
  const Option = ({
    kind,
    k,
    title,
    sub,
  }: {
    kind: "contract" | "letter";
    k: string;
    title: string;
    sub: string;
  }) => (
    <button
      type="button"
      disabled={!!busy}
      onClick={() => create(kind, k)}
      className="rounded-xl border p-4 text-right transition hover:border-brand hover:bg-brand-soft/50 disabled:opacity-60"
    >
      <span className="block font-medium">{busy === k ? "جارٍ الإنشاء…" : title}</span>
      <span className="text-xs text-muted">{sub}</span>
    </button>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="مستند جديد" wide>
      {error && <Notice>{error}</Notice>}
      <h3 className="mb-2 text-sm font-semibold">عقد</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.data?.contracts.map((c) => (
          <Option
            key={c.key}
            kind="contract"
            k={c.key}
            title={c.title}
            sub={`${c.clauses} بنداً · يُعبأ من بيانات المشروع`}
          />
        ))}
      </div>
      <h3 className="mt-6 mb-2 text-sm font-semibold">خطاب</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {t.data?.letters.map((l) => (
          <Option
            key={l.key}
            kind="letter"
            k={l.key}
            title={l.title}
            sub={l.key === "cashback" ? "بمبلغ الكاش باك من المالية" : "نص حر بترويسة الجهة"}
          />
        ))}
      </div>
    </Dialog>
  );
}
