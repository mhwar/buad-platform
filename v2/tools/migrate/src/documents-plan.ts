/**
 * v1 contracts and letters (fin.contracts[] / fin.letters[], app.html L2972–3003, L7759) → v2 documents.
 * Pure: images stay as data URLs here; the importer turns them into deduplicated R2 assets.
 */
type Loose = Record<string, unknown>;

export type PlannedDoc = {
  id: string;
  projectId: string;
  kind: "contract" | "letter";
  /** Number printed on the v1 letter (contracts keep theirs in variables.contract_no). */
  v1Number: string;
  title: string;
  templateKey: string;
  status: "draft" | "review" | "approved";
  variables: Record<string, string>;
  content: {
    id: string;
    key: string;
    title: string;
    baseTitle: string;
    content: string;
    pageBreak: boolean;
  }[];
  layout: {
    fontSize?: number;
    lineHeight?: number;
    titleSize?: number;
    clauseTitleSize?: number;
    marginX?: number;
    showHeader: boolean;
    showFooter: boolean;
    useOrgStamp: boolean;
    footerLabel: string;
  };
  images: { header: string; footer: string; stamp: string };
  hadCover: boolean;
  /** v1 dates are YYYY-MM-DD; seconds since epoch or null. */
  updatedAt: number | null;
};

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const epoch = (v: unknown) =>
  /^\d{4}-\d{2}-\d{2}/.test(s(v))
    ? Math.floor(Date.parse(`${s(v).slice(0, 10)}T00:00:00Z`) / 1000)
    : null;
const dataImage = (v: unknown) =>
  /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s(v)) ? s(v) : "";
const FOOTER_LABELS = new Set(["سري", "مسودة", "نسخة طبق الأصل", "نهائي"]);
/** «المادة الأولى: موضوع العقد» → «موضوع العقد» so v2 can renumber it. */
const NUMBERED = /^المادة\s+[^:]+:\s*(.+)$/;

function layoutOf(x: Loose): PlannedDoc["layout"] {
  const st = (x.doc_style ?? {}) as Loose;
  const mg = (x.doc_margins ?? {}) as Loose;
  const pl = (x.page_layout ?? {}) as Loose;
  const header = (pl.header ?? {}) as Loose;
  const footer = (pl.footer ?? {}) as Loose;
  const sides = [num(mg.right, 0.5, 4), num(mg.left, 0.5, 4)].filter(
    (n): n is number => n !== undefined,
  );
  return {
    fontSize: num(st.font_size, 9, 18),
    lineHeight: num(st.line_height, 1, 2.6),
    titleSize: num(st.title_size, 12, 28),
    clauseTitleSize: num(st.clause_title_size, 10, 20),
    marginX: sides.length ? Math.max(...sides) : undefined,
    showHeader: header.show !== false,
    showFooter: footer.show !== false,
    useOrgStamp: false,
    footerLabel: FOOTER_LABELS.has(s(x.footer_label)) ? s(x.footer_label) : "",
  };
}

const imagesOf = (x: Loose) => {
  const pl = (x.page_layout ?? {}) as Loose;
  return {
    header: dataImage(((pl.header ?? {}) as Loose).image),
    footer: dataImage(((pl.footer ?? {}) as Loose).image),
    stamp: dataImage(x.stamp_image),
  };
};

export function planDocuments(projectId: string, fin: Loose): PlannedDoc[] {
  const out: PlannedDoc[] = [];
  const contracts = Array.isArray(fin.contracts) ? (fin.contracts as Loose[]) : [];
  for (const [i, c] of contracts.entries()) {
    const vars = (c.variables ?? {}) as Loose;
    const variables = Object.fromEntries(
      Object.entries(vars)
        .filter(([, v]) => typeof v === "string" || typeof v === "number")
        .map(([k, v]) => [k, s(v)]),
    );
    const clauses = (Array.isArray(c.clauses) ? (c.clauses as Loose[]) : [])
      .filter((cl) => cl.enabled !== false)
      .map((cl, j) => {
        const title = s(cl.title);
        const m = NUMBERED.exec(title);
        return {
          id: s(cl.id) || `cl_${j}`,
          key: s(cl.key),
          title: m ? "" : title,
          baseTitle: m ? (m[1] ?? "").trim() : "",
          content: s(cl.content),
          pageBreak: !!cl.page_break,
        };
      });
    const status = s(c.status);
    out.push({
      id: `v1doc_${projectId}_${s(c.id) || i}`,
      projectId,
      kind: "contract",
      v1Number: "",
      title: s(c.title) || "عقد",
      templateKey: s(c.template_type),
      status:
        status === "approved" || status === "final"
          ? "approved"
          : status === "review"
            ? "review"
            : "draft",
      variables,
      content: clauses,
      layout: layoutOf(c),
      images: imagesOf(c),
      hadCover: !!(c.cover && typeof c.cover === "object" && Object.keys(c.cover as object).length),
      updatedAt: epoch(c.updated) ?? epoch(c.created),
    });
  }
  const letters = Array.isArray(fin.letters) ? (fin.letters as Loose[]) : [];
  for (const [i, l] of letters.entries()) {
    const images = imagesOf(l);
    out.push({
      id: `v1doc_${projectId}_L${s(l.id) || i}`,
      projectId,
      kind: "letter",
      v1Number: s(l.no).trim(),
      title: s(l.title),
      templateKey: s(l.type) || "custom",
      status: "draft",
      variables: {
        letter_to_honorific: s(l.to_honorific),
        letter_to: s(l.to),
        letter_to_suffix: s(l.recipient_suffix),
        letter_salutation: l.show_salutation === false ? "" : s(l.salutation),
        letter_closing: l.show_closing === false ? "" : s(l.closing),
        letter_date: /^\d{4}-\d{2}-\d{2}$/.test(s(l.date)) ? s(l.date) : "",
        letter_signer_name: s(l.signer_name),
        letter_signer_title: s(l.signer_title),
      },
      content: [
        { id: "body", key: "body", title: "", baseTitle: "", content: s(l.body), pageBreak: false },
      ],
      layout: { ...layoutOf(l), useOrgStamp: !!images.stamp },
      images,
      hadCover: false,
      updatedAt: epoch(l.date) ?? epoch(l.created),
    });
  }
  return out;
}
