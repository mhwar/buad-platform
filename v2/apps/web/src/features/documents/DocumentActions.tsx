import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  Copy,
  FileDown,
  FileText,
  FolderOpen,
  RotateCcw,
  Send,
  Share2,
  Stamp,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { confirmAction, type MenuItem } from "../../components/ui";
import { type DocDetail, docApi, documentQuery } from "./api";
import { confirmApprove } from "./approve";
import { DocumentView, documentUrls } from "./DocumentView";
import { downloadPdf, downloadWord, fileBase } from "./export";
import { SendDialog } from "./SendDialog";

/** «ص-2026-0015 / PRJ-2026-0003» once registered, else "". */
export const outgoingRef = (d: DocDetail) =>
  d.document.outgoingNo ? `${d.document.outgoingNo} / ${d.project.number}` : "";

/**
 * Renders the document (print view, not the editing one) off-screen as real A4 pages and
 * hands back the pages once images and fonts are ready. Used by «تنزيل PDF» from anywhere.
 */
export function renderOffscreen(
  detail: DocDetail,
): Promise<{ root: HTMLElement; done: () => void }> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:210mm;pointer-events:none";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  const reactRoot = createRoot(host);
  const done = () => {
    reactRoot.unmount();
    host.remove();
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      done();
      reject(new Error("render_timeout"));
    }, 20000);
    const d = detail.document;
    reactRoot.render(
      <DocumentView
        kind={d.kind}
        number={d.number}
        title={d.title}
        content={d.content}
        layout={d.layout}
        values={detail.values}
        org={detail.org}
        outgoing={outgoingRef(detail)}
        onReady={(root) => {
          clearTimeout(timer);
          // One more frame so the last measured layout is painted.
          requestAnimationFrame(() => resolve({ root, done }));
        }}
      />,
    );
  });
}

/** «تنزيل PDF»: vector from the server, or the off-screen capture if that is unavailable. */
export async function exportPdf(detail: DocDetail) {
  return downloadPdf({
    endpoint: "/api/pdf",
    body: { path: `/print/documents/${detail.document.id}`, name: fileBase(detail.document) },
    name: fileBase(detail.document),
    pages: () => renderOffscreen(detail),
  });
}

export async function exportWord(detail: DocDetail) {
  const urls = documentUrls(detail.document.layout, detail.org.urls);
  await downloadWord(detail, outgoingRef(detail), {
    header: urls.headerAsset ?? "",
    footer: urls.footerAsset ?? "",
    stamp: urls.stampAsset ?? "",
    signature: urls.signatureAsset ?? "",
  });
}

type DocSummary = {
  id: string;
  projectId: string;
  status: "draft" | "review" | "approved";
  outgoingNo: string;
};

/**
 * Actions a document offers wherever it is listed (register, project list): open, download,
 * workflow, outgoing number, copy, delete. The editor uses the download part too.
 */
export function useDocumentActions(manager: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<DocDetail | null>(null);

  const detail = (id: string) => qc.fetchQuery({ ...documentQuery(id), staleTime: 0 });
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch {
      setError(`تعذّر ${label}`);
    } finally {
      setBusy(null);
    }
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["documents"] });

  const items = (d: DocSummary): MenuItem[] => {
    const open = () =>
      navigate({
        to: "/projects/$id/documents/$docId",
        params: { id: d.projectId, docId: d.id },
      });
    const status = (to: DocSummary["status"]) =>
      run("تغيير الحالة", async () => {
        const full = await detail(d.id);
        await docApi.status(d.id, to, full.document.version);
        await refresh();
      });
    return [
      { label: "فتح", icon: <FolderOpen />, onSelect: open },
      { section: "تنزيل" },
      {
        label: "تنزيل PDF",
        hint: "بمقاس A4 كما يظهر",
        icon: <FileDown />,
        onSelect: () =>
          run("تجهيز ملف PDF", async () => {
            if ((await exportPdf(await detail(d.id))) === "image")
              setError("نُزّل الملف بجودة الصورة لأن خدمة PDF غير متاحة مؤقتاً.");
          }),
      },
      {
        label: "تصدير Word",
        hint: "للتعديل على الصياغة",
        icon: <FileText />,
        onSelect: () => run("تجهيز ملف Word", async () => exportWord(await detail(d.id))),
      },
      ...((manager && d.status === "approved"
        ? [
            {
              label: "إرسال للعميل",
              hint: "رابط آمن عبر واتساب أو البريد",
              icon: <Share2 />,
              onSelect: () => run("تجهيز الإرسال", async () => setSending(await detail(d.id))),
            },
          ]
        : []) as MenuItem[]),
      ...((manager
        ? [
            { section: "سير العمل" },
            ...(d.status === "draft"
              ? [{ label: "إرسال للمراجعة", icon: <Send />, onSelect: () => status("review") }]
              : []),
            ...(d.status !== "approved"
              ? [
                  {
                    label: "اعتماد",
                    hint: "يقفل المستند ويحفظ نسخة منه",
                    icon: <Check />,
                    onSelect: async () => {
                      if (await confirmApprove(qc)) status("approved");
                    },
                  },
                ]
              : [
                  {
                    label: "إعادة فتح للتعديل",
                    icon: <RotateCcw />,
                    onSelect: () => status("draft"),
                  },
                ]),
            ...(d.status === "approved" && !d.outgoingNo
              ? [
                  {
                    label: "تسجيل صادر",
                    hint: "رقم من سجل الصادر، نهائي",
                    icon: <Stamp />,
                    onSelect: async () => {
                      if (
                        await confirmAction({
                          title: "تسجيل رقم صادر؟",
                          text: "يُعطى المستند رقماً من سجل الصادر يظهر في المطبوع. الرقم نهائي ولا يُعاد استخدامه.",
                          action: "تسجيل الصادر",
                        })
                      )
                        run("تسجيل الصادر", async () => {
                          await docApi.outgoing(d.id);
                          await refresh();
                        });
                    },
                  },
                ]
              : []),
            "separator",
            {
              label: "نسخ كمستند جديد",
              icon: <Copy />,
              onSelect: () =>
                run("النسخ", async () => {
                  const r = await docApi.duplicate(d.id);
                  await refresh();
                  await navigate({
                    to: "/projects/$id/documents/$docId",
                    params: { id: d.projectId, docId: r.id },
                  });
                }),
            },
            ...(d.status === "draft"
              ? [
                  {
                    label: "حذف المسودة",
                    icon: <Trash2 />,
                    danger: true,
                    onSelect: async () => {
                      if (
                        await confirmAction({
                          title: "حذف هذه المسودة نهائياً؟",
                          action: "حذف نهائياً",
                          danger: true,
                        })
                      )
                        run("الحذف (المسودات التي سبق اعتمادها لا تُحذف)", async () => {
                          await docApi.remove(d.id);
                          await refresh();
                        });
                    },
                  },
                ]
              : []),
          ]
        : []) as MenuItem[]),
    ];
  };
  const dialog = sending ? <SendDialog detail={sending} onClose={() => setSending(null)} /> : null;
  return { items, busy, error, dialog };
}

/** `/print/documents/:id`: the document alone, as printed (used by the PDF renderer). */
export function PrintDocumentPage({ docId }: { docId: string }) {
  const q = useQuery(documentQuery(docId));
  if (!q.data) return null;
  const d = q.data.document;
  return (
    <div className="print-root">
      <DocumentView
        kind={d.kind}
        number={d.number}
        title={d.title}
        content={d.content}
        layout={d.layout}
        values={q.data.values}
        org={q.data.org}
        outgoing={outgoingRef(q.data)}
      />
    </div>
  );
}
