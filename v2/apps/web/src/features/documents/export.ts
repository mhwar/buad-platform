import { type Resolved, segments } from "@buad/domain";
import type { DocDetail } from "./api";

/* ─────────────────────────────────────────────────────────────────────────────
 * Downloads of a document:
 *  - PDF   each rendered A4 page is captured as an image and placed on an A4 PDF page,
 *          so the file looks exactly like the screen (Arabic shaping, letterhead, stamp).
 *  - Word  an MHTML .doc (the format Word opens from HTML) with A4 page setup and the
 *          letterhead images embedded, for when a client wants to edit the wording.
 * The heavy libraries load only when a download is asked for.
 * ──────────────────────────────────────────────────────────────────────────── */

const ascii = (s: string) => s.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
/** File name for downloads: the document number (ASCII; some browsers drop Arabic names). */
export const fileBase = (d: DocDetail["document"]) => ascii(d.number);

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** `root` is a rendered PagedSheets (`.doc-pages`). */
export async function downloadPdf(root: HTMLElement, name: string) {
  const [{ domToJpeg }, { jsPDF }] = await Promise.all([
    import("modern-screenshot"),
    import("jspdf"),
  ]);
  const pages = Array.from(root.querySelectorAll<HTMLElement>(":scope > .doc-page"));
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  for (const [i, page] of pages.entries()) {
    const img = await domToJpeg(page, {
      scale: 2,
      quality: 0.88,
      backgroundColor: "#ffffff",
      // Screen-only marks are not part of the document.
      filter: (n) =>
        !(
          n instanceof HTMLElement &&
          (n.classList.contains("doc-page-no") || n.classList.contains("doc-watermark-approved"))
        ),
    });
    if (i > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(img, "JPEG", 0, 0, 210, 297, undefined, "FAST");
  }
  save(pdf.output("blob"), `${name}.pdf`);
}

/* ── Word ─────────────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Variables filled; an empty one becomes a blank line to write on, like the printed page. */
function fill(text: string, values: Resolved) {
  return segments(text, values)
    .map((s) => esc("text" in s ? s.text : s.empty ? "…………" : s.value))
    .join("");
}
const paras = (t: string, values: Resolved) =>
  t
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p class=p>${fill(p, values).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** Any image (SVG included) → PNG data, which every Word version shows. */
async function toPng(url: string, width: number): Promise<string> {
  if (!url) return "";
  try {
    const blob = await (await fetch(url, { credentials: "same-origin" })).blob();
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = width;
    const h = Math.round((img.naturalHeight / (img.naturalWidth || 1)) * w) || 1;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(src);
    return c.toDataURL("image/png");
  } catch {
    return "";
  }
}

type Images = { header: string; footer: string; stamp: string; signature: string };

function body(detail: DocDetail, outgoing: string): string {
  const { document: d, values } = detail;
  const v = (k: string) => esc(values[k]?.value ?? "");
  if (d.kind === "letter") {
    const date = values.letter_date?.value ?? "";
    return `
<table class=meta width="100%"><tr>
  <td>الرقم: ${esc(outgoing || d.number)}</td>
  <td align=left>التاريخ: ${esc(date.split("-").reverse().join("/"))}${values.letter_date_hijri?.value ? ` الموافق ${v("letter_date_hijri")} هـ` : ""}</td>
</tr></table>
<p class=p><b>${fill("{{letter_to_honorific}} / {{letter_to}} {{letter_to_suffix}}", values)}</b></p>
<p class=p>${fill("{{letter_salutation}}", values)}</p>
<p class=subject>الموضوع: ${esc(d.title)}</p>
${paras(d.content[0]?.content ?? "", values)}
<p class=p>${fill("{{letter_closing}}", values)}</p>
<table width="100%"><tr><td width="55%"></td><td align=center>
  <p class=p><b>${esc(detail.org.name)}</b></p>
  <p class=p>${v("letter_signer_name") || v("company_signer_name")}</p>
  <p class=p>${v("letter_signer_title") || v("company_signer_title")}</p>
  ${d.layout.useOrgStamp ? "<img src='stamp.png' width=110>" : ""}
</td></tr></table>`;
  }
  const clauses = d.content
    .map((c) => {
      const h = c.title || c.baseTitle;
      const br = c.pageBreak ? "<br clear=all style='page-break-before:always'>" : "";
      return `${br}${h ? `<h2>${esc(h)}</h2>` : ""}${paras(c.content, values)}`;
    })
    .join("");
  const sig = (head: string, p: "a" | "b", withImages: boolean) => `
<td width="50%" valign=top>
  <p class=p><b>${head}</b></p>
  <p class=p>${v(`party_${p}_name`)}</p>
  <p class=p>${v(`party_${p}_rep_name`)}${values[`party_${p}_title`]?.value ? ` — ${v(`party_${p}_title`)}` : ""}</p>
  ${withImages && d.layout.useOrgSignature ? "<img src='signature.png' width=120>" : ""}
  ${withImages && d.layout.useOrgStamp ? "<img src='stamp.png' width=110>" : ""}
  <p class=p style='color:#6b7280'>______________________<br>التوقيع والختم</p>
</td>`;
  return `
${outgoing ? `<p class=p style='font-size:9pt'>رقم الصادر: ${esc(outgoing)}</p>` : ""}
<h1>${esc(d.title)}</h1>
${clauses}
${d.layout.showSignatures ? `<table width="100%" style='margin-top:24pt'><tr>${sig("الطرف الأول", "a", true)}${sig("الطرف الثاني", "b", false)}</tr></table>` : ""}`;
}

export async function downloadWord(detail: DocDetail, outgoing: string, urls: Images) {
  const l = detail.document.layout;
  const [header, footer, stamp, signature] = await Promise.all([
    l.showHeader ? toPng(urls.header, 1654) : "",
    l.showFooter ? toPng(urls.footer, 1654) : "",
    toPng(urls.stamp, 400),
    toPng(urls.signature, 400),
  ]);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" dir=rtl>
<head><meta charset="utf-8"><title>${esc(detail.document.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: 21cm 29.7cm; margin: 1cm ${l.marginX}cm 1cm ${l.marginX}cm; }
div.Section1 { page: Section1; }
body { font-family: "IBM Plex Sans Arabic", "Arial", sans-serif; font-size: ${l.fontSize}pt; direction: rtl; }
h1 { text-align: center; font-size: ${l.titleSize}pt; margin: 6pt 0 14pt; }
h2 { font-size: ${l.clauseTitleSize}pt; margin: 10pt 0 4pt; }
p.p { margin: 0 0 6pt; text-align: justify; line-height: ${l.lineHeight}; }
p.subject { text-align: center; font-weight: bold; text-decoration: underline; margin: 10pt 0; }
table.meta td { font-size: ${Math.max(8, l.fontSize - 1)}pt; color: #374151; }
</style></head>
<body dir=rtl><div class=Section1>
${header ? "<p style='margin:0'><img src='header.png' width=600></p>" : ""}
${body(detail, outgoing)}
${footer ? "<p style='margin:12pt 0 0'><img src='footer.png' width=600></p>" : ""}
</div></body></html>`;
  save(
    new Blob([`\ufeff${mhtml(html, { header, footer, stamp, signature })}`], {
      type: "application/msword",
    }),
    `${fileBase(detail.document)}.doc`,
  );
}

const wrap76 = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
const b64Utf8 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** Word's single-file web page: the HTML plus each image as a related part. */
export function mhtml(html: string, images: Record<string, string>) {
  const B = "----=_NextPart_BUAD_DOC_01";
  let out = `MIME-Version: 1.0\r\nContent-Type: multipart/related; type="text/html"; boundary="${B}"\r\n\r\n`;
  out += `--${B}\r\nContent-Location: file:///C:/buad/doc.htm\r\nContent-Transfer-Encoding: base64\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n`;
  out += `${wrap76(b64Utf8(html))}\r\n\r\n`;
  for (const [name, data] of Object.entries(images)) {
    if (!data.startsWith("data:")) continue;
    const mime = /^data:([^;]+);/.exec(data)?.[1] ?? "image/png";
    out += `--${B}\r\nContent-Location: file:///C:/buad/${name}.png\r\nContent-Transfer-Encoding: base64\r\nContent-Type: ${mime}\r\n\r\n`;
    out += `${wrap76(data.split(",")[1] ?? "")}\r\n\r\n`;
  }
  return `${out}--${B}--\r\n`;
}
