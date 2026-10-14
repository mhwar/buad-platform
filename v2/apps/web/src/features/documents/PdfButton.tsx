import { FileDown } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui";
import { downloadPdf } from "./export";

/**
 * «تنزيل PDF» for an app page that is already on screen as A4 pages (statement, report):
 * the server prints `path` as a real PDF; if unavailable, the on-screen pages are captured.
 */
export function PdfButton({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(false);
  return (
    <>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const got = await downloadPdf({
              endpoint: "/api/pdf",
              body: { path, name },
              name,
              pages: async () => {
                const root = document.querySelector<HTMLElement>(".print-root .doc-pages");
                if (!root) throw new Error("no_pages");
                return { root };
              },
            });
            setImage(got === "image");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileDown className="size-4" /> {busy ? "جارٍ التجهيز…" : "تنزيل PDF"}
      </Button>
      {image && (
        <span className="self-center text-xs text-amber-700 dark:text-amber-300">
          نُزّل بجودة الصورة (خدمة PDF غير متاحة مؤقتاً)
        </span>
      )}
    </>
  );
}
