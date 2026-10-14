import { DEFAULT_SITE, type SiteContent } from "@buad/schema/site";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileDown, Printer } from "lucide-react";
import { useState } from "react";
import { Button, EmptyState, Notice } from "../../components/ui";
import { ok } from "../../lib/format";
import { PdfButton } from "../documents/PdfButton";
import { siteProductQuery } from "../site/site-api";
import { type BrochureData, BrochureDeck } from "./Brochure";
import { productQuery } from "./products-api";

const siteDraftQuery = {
  queryKey: ["site-draft"],
  queryFn: async () => ok<{ content: SiteContent }>(await fetch("/api/site/draft")),
};

/** Downloads the public service profile (cached on the server). */
export async function downloadPublicBrochure(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/public/site/products/${slug}/brochure`, { method: "POST" });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/pdf")) return false;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `${slug}-profile.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Managers: the profile of any product (draft or published), to review, print or save as PDF. */
export function ProductBrochurePage({ id }: { id: string }) {
  const p = useQuery(productQuery(id));
  const site = useQuery(siteDraftQuery);
  const [ready, setReady] = useState(false);
  if (p.isPending || site.isPending)
    return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!p.data) return <EmptyState title="المنتج غير موجود" />;
  const c = site.data?.content ?? DEFAULT_SITE;
  const data: BrochureData = {
    name: p.data.name,
    tagline: p.data.tagline,
    content: p.data.content,
    brand: c.brand,
    contact: c.contact,
  };
  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            to="/products/$id"
            params={{ id }}
            search={{ step: "publish" }}
            className="text-sm text-muted hover:text-ink"
          >
            ← {p.data.name}
          </Link>
          <h1 className="text-xl font-bold">الملف التعريفي بالخدمة</h1>
          <p className="text-xs text-muted">يُبنى من محتوى المنتج. لا يحمل أي تكلفة أو سعر.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
          <PdfButton path={`/print/products/${id}`} name={`${p.data.slug}-profile`} />
        </div>
      </div>
      <div
        className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0"
        data-pdf-ready={ready ? "" : undefined}
      >
        <BrochureDeck data={data} ready={setReady} />
      </div>
    </div>
  );
}

/** Public: the published product's profile (also what the PDF renderer opens, with ?render=1). */
export function PublicBrochurePage({ slug }: { slug: string }) {
  const q = useQuery(siteProductQuery(slug));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const render = typeof window !== "undefined" && window.location.search.includes("render=1");
  if (q.isPending) return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200" />;
  if (!q.data) return <EmptyState title="الملف غير متاح" />;
  const { site, product } = q.data;
  const data: BrochureData = {
    name: product.name,
    tagline: product.tagline,
    content: product.content,
    brand: site.brand,
    contact: site.contact,
  };
  return (
    <div style={{ background: "#f4f4f6", minHeight: "100vh" }} dir="rtl">
      {!render && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 p-4 print:hidden">
          <Link
            to="/site/p/$slug"
            params={{ slug }}
            className="text-sm"
            style={{ color: "#5c6078" }}
          >
            ← العودة إلى صفحة الخدمة
          </Link>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setFailed(!(await downloadPublicBrochure(slug)));
              setBusy(false);
            }}
          >
            <FileDown className="size-4" /> {busy ? "جارٍ التجهيز…" : "تنزيل PDF"}
          </Button>
        </div>
      )}
      {failed && (
        <div className="mx-auto max-w-6xl px-4">
          <Notice>تعذّر تجهيز الملف الآن. يمكنك طباعة هذه الصفحة وحفظها PDF.</Notice>
        </div>
      )}
      <div
        className="print-root mx-auto max-w-6xl p-3 sm:p-4 print:p-0"
        data-pdf-ready={ready ? "" : undefined}
      >
        <BrochureDeck data={data} ready={setReady} />
      </div>
    </div>
  );
}
