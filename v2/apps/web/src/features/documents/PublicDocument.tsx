import { DOC_KIND_LABELS } from "@buad/schema/documents";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { FileDown, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { Logo } from "../../brand";
import { Button } from "../../components/ui";
import { fromEpoch, ok } from "../../lib/format";
import type { PublicDocument } from "./api";
import { DocumentView } from "./DocumentView";
import { downloadPdf } from "./export";
import { FitToWidth } from "./FitToWidth";

const route = getRouteApi("/s/$token");

/** What a recipient sees from a share link: the approved document, to read, print or download. */
export function PublicDocumentPage() {
  const { token } = route.useParams();
  const q = useQuery({
    queryKey: ["public-share", token],
    queryFn: async () => ok<PublicDocument>(await fetch(`/api/public/s/${token}`)),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const pages = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.isPending)
    return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (q.isError || !q.data)
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <Logo className="mx-auto mb-8 h-12 w-auto" />
        <h1 className="text-xl font-bold">الرابط غير متاح</h1>
        <p className="mt-2 text-sm text-muted">
          انتهت صلاحية هذا الرابط أو أُلغي. تواصلوا مع الجهة المرسِلة لطلب رابط جديد.
        </p>
      </main>
    );
  const p = q.data;
  const d = p.document;
  const assetUrl = (id: string, fallback: string) =>
    id ? `/api/public/s/${token}/assets/${id}` : fallback;
  const name = d.number.replace(/[^\w.-]+/g, "-") || "document";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">{p.org.name}</p>
            <h1 className="truncate font-bold">
              {DOC_KIND_LABELS[d.kind]}: {d.title}
            </h1>
            <p className="text-xs text-muted">
              معتمد {fromEpoch(p.approvedAt)} · الرابط صالح حتى {fromEpoch(p.expiresAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={async () => {
                if (!pages.current) return;
                setBusy(true);
                try {
                  await downloadPdf(pages.current, name);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileDown className="size-4" /> {busy ? "جارٍ التجهيز…" : "تنزيل PDF"}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> طباعة
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-3 sm:p-6">
        <div className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
          <FitToWidth>
            <DocumentView
              kind={d.kind}
              number={d.number}
              title={d.title}
              content={d.content}
              layout={d.layout}
              values={p.values}
              org={p.org}
              outgoing={p.outgoing}
              assetUrl={assetUrl}
              onReady={(root) => {
                pages.current = root;
              }}
            />
          </FitToWidth>
        </div>
      </main>
    </div>
  );
}
