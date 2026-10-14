import { type Resolved, segments } from "@buad/domain";
import type { Clause, DocLayout } from "@buad/schema/documents";
import { Fragment, type ReactNode } from "react";
import { type Block, PagedSheets } from "./Pages";

/** Labels for variables, shown in place of empty values while editing. */
export const VAR_LABELS: Record<string, string> = {
  party_a_name: "اسم الطرف الأول",
  party_a_rep_name: "ممثل الطرف الأول",
  party_a_title: "صفة ممثل الطرف الأول",
  party_a_id: "هوية ممثل الطرف الأول",
  party_a_address: "عنوان الطرف الأول",
  party_a_phone: "هاتف الطرف الأول",
  party_a_email: "بريد الطرف الأول",
  party_a_reg: "سجل الطرف الأول",
  party_a_tax: "الرقم الضريبي للطرف الأول",
  party_b_name: "اسم الطرف الثاني",
  party_b_rep_name: "ممثل الطرف الثاني",
  party_b_title: "صفة ممثل الطرف الثاني",
  party_b_id: "هوية/سجل الطرف الثاني",
  party_b_address: "عنوان الطرف الثاني",
  party_b_phone: "هاتف الطرف الثاني",
  party_b_email: "بريد الطرف الثاني",
  party_b_reg: "سجل الطرف الثاني",
  party_b_tax: "الرقم الضريبي للطرف الثاني",
  contract_no: "رقم العقد",
  contract_date_gregorian: "تاريخ العقد",
  contract_date_hijri: "التاريخ الهجري",
  contract_city: "مدينة العقد",
  signature_city: "مدينة التوقيع",
  subject: "موضوع العقد",
  contract_amount: "قيمة العقد",
  contract_amount_words: "القيمة كتابةً",
  currency: "العملة",
  duration_months: "المدة",
  duration_unit: "وحدة المدة",
  duration_full: "المدة الكاملة",
  payment_method: "طريقة الدفع",
  cashback_amount: "مبلغ الكاش باك",
  cashback_amount_words: "الكاش باك كتابةً",
  letter_to_honorific: "اللقب",
  letter_to: "الجهة المرسل إليها",
  letter_to_suffix: "الخاتمة",
  letter_salutation: "التحية",
  letter_closing: "الختام",
  letter_date: "تاريخ الخطاب",
  company_name: "اسم الجهة",
  company_phone: "هاتف الجهة",
  company_email: "بريد الجهة",
};

type Props = {
  kind: "contract" | "letter";
  number: string;
  title: string;
  content: Clause[];
  layout: DocLayout;
  values: Resolved;
  org: { name: string; urls: Record<string, string> };
  /** Editing: show variables as chips and empty ones as amber placeholders. */
  editing?: boolean;
  approved?: boolean;
  /** Outgoing register reference («ص-2026-0015 / PRJ-2026-0003»), once registered. */
  outgoing?: string;
  /** How an asset id becomes a URL (public share pages use their own route). */
  assetUrl?: (id: string, fallback: string) => string;
};

function Text({ text, values, editing }: { text: string; values: Resolved; editing?: boolean }) {
  return (
    <>
      {segments(text, values).map((s, i) =>
        "text" in s ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string
          <Fragment key={i}>{s.text}</Fragment>
        ) : s.empty ? (
          <span
            key={`${s.key}-${i}`}
            className={editing ? "doc-var doc-var-empty" : "doc-var-blank"}
            title={VAR_LABELS[s.key] ?? s.key}
          >
            {editing ? (VAR_LABELS[s.key] ?? s.key) : "…………"}
          </span>
        ) : (
          <span
            key={`${s.key}-${i}`}
            className={editing ? "doc-var" : undefined}
            title={editing ? VAR_LABELS[s.key] : undefined}
          >
            {s.value}
          </span>
        ),
      )}
    </>
  );
}

const paragraphs = (t: string) => t.split(/\n{2,}/).filter((p) => p.trim());
const v = (values: Resolved, k: string) => values[k]?.value ?? "";

const ownAsset = (id: string, fallback: string) => (id ? `/api/assets/${id}` : fallback);

/** Image URLs a document prints with: its own letterhead/stamp (e.g. from v1) win over the org's. */
export function documentUrls(
  layout: DocLayout,
  orgUrls: Record<string, string>,
  assetUrl: (id: string, fallback: string) => string = ownAsset,
): Record<string, string> {
  return {
    ...orgUrls,
    headerAsset: assetUrl(layout.headerAsset, orgUrls.headerAsset ?? ""),
    footerAsset: assetUrl(layout.footerAsset, orgUrls.footerAsset ?? ""),
    stampAsset: assetUrl(layout.stampAsset, orgUrls.stampAsset ?? ""),
  };
}

/** One paragraph: single line breaks inside it are kept. */
function Para({ text, values, editing }: { text: string; values: Resolved; editing?: boolean }) {
  return (
    <p className="doc-p">
      {text.split("\n").map((line, j) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines of one paragraph
        <Fragment key={j}>
          {j > 0 && <br />}
          <Text text={line} values={values} editing={editing} />
        </Fragment>
      ))}
    </p>
  );
}

/**
 * One renderer for the screen preview, printing and PDF: the document is cut into blocks
 * and laid out on real A4 pages, each carrying the letterhead.
 */
export function DocumentView(props: Props & { onReady?: (root: HTMLElement) => void }) {
  const org = { ...props.org, urls: documentUrls(props.layout, props.org.urls, props.assetUrl) };
  const p = { ...props, org };
  const { layout: l } = p;
  const style = {
    "--doc-fs": `${l.fontSize}pt`,
    "--doc-lh": l.lineHeight,
    "--doc-mx": `${l.marginX}cm`,
  } as React.CSSProperties;
  return (
    <PagedSheets
      title={p.title}
      style={style}
      watermark={p.approved ? "معتمد" : ""}
      header={l.showHeader ? org.urls.headerAsset : ""}
      footer={l.showFooter ? org.urls.footerAsset : ""}
      footerLabel={l.showFooter ? l.footerLabel : ""}
      blocks={p.kind === "contract" ? contractBlocks(p) : letterBlocks(p)}
      onReady={props.onReady}
    />
  );
}

function contractBlocks({
  title,
  content,
  layout: l,
  values,
  editing,
  org,
  outgoing,
}: Props): Block[] {
  const blocks: Block[] = [];
  if (outgoing)
    blocks.push({
      key: "outgoing",
      node: (
        <p className="doc-outgoing">
          رقم الصادر: <span dir="rtl">{outgoing}</span>
        </p>
      ),
    });
  blocks.push({
    key: "title",
    keepWithNext: true,
    node: (
      <h1 className="doc-title" style={{ fontSize: `${l.titleSize}pt` }}>
        {title}
      </h1>
    ),
  });
  for (const c of content) {
    const heading = c.title || c.baseTitle;
    const paras = paragraphs(c.content);
    let first = true;
    if (heading) {
      blocks.push({
        key: `${c.id}-h`,
        breakBefore: c.pageBreak,
        keepWithNext: paras.length > 0,
        node: (
          <h2 className="doc-clause-title" style={{ fontSize: `${l.clauseTitleSize}pt` }}>
            {heading}
          </h2>
        ),
      });
      first = false;
    }
    paras.forEach((para, i) => {
      const end = i === paras.length - 1 ? "doc-clause-end" : "";
      const lines = para.split("\n");
      // A long multi-line paragraph (e.g. the parties' details) may continue on the next page.
      const parts = lines.length >= 4 ? lines : [para];
      parts.forEach((part, j) => {
        const last = j === parts.length - 1;
        blocks.push({
          key: `${c.id}-${i}-${j}`,
          breakBefore: first && c.pageBreak,
          keepWithNext: parts.length > 1 && j === 0,
          className: `${last ? end : "doc-line"}`,
          node: <Para text={part} values={values} editing={editing} />,
        });
        first = false;
      });
    });
  }
  if (l.showSignatures)
    blocks.push({
      key: "signatures",
      keepWithPrev: true,
      node: (
        <section className="doc-signatures">
          <SignatureBlock
            heading="الطرف الأول"
            name={v(values, "party_a_name")}
            rep={v(values, "party_a_rep_name")}
            role={v(values, "party_a_title")}
            signature={l.useOrgSignature ? org.urls.signatureAsset : ""}
            stamp={l.useOrgStamp ? org.urls.stampAsset : ""}
          />
          <SignatureBlock
            heading="الطرف الثاني"
            name={v(values, "party_b_name")}
            rep={v(values, "party_b_rep_name")}
            role={v(values, "party_b_title")}
          />
        </section>
      ),
    });
  return blocks;
}

function SignatureBlock({
  heading,
  name,
  rep,
  role,
  signature,
  stamp,
}: {
  heading: string;
  name: string;
  rep: string;
  role: string;
  signature?: string;
  stamp?: string;
}) {
  return (
    <div className="doc-sign">
      <p className="doc-sign-heading">{heading}</p>
      <p>{name}</p>
      {rep && (
        <p>
          {rep}
          {role && ` — ${role}`}
        </p>
      )}
      <div className="doc-sign-area">
        {signature && <img src={signature} alt="التوقيع" className="doc-sign-img" />}
        {stamp && <img src={stamp} alt="الختم" className="doc-stamp-img" />}
      </div>
      <p className="doc-sign-line">التوقيع والختم</p>
    </div>
  );
}

function letterBlocks({
  number,
  title,
  content,
  layout: l,
  values,
  editing,
  org,
  outgoing,
}: Props): Block[] {
  const body = content[0]?.content ?? "";
  const date = v(values, "letter_date");
  const t = (text: string) => <Text text={text} values={values} editing={editing} />;
  return [
    {
      key: "meta",
      node: (
        <div className="doc-letter-meta">
          <span>
            الرقم: <span dir="rtl">{outgoing || number}</span>
          </span>
          <span>
            التاريخ: {date ? date.split("-").reverse().join("/") : "—"}
            {values.today_hijri && date && <> الموافق {hijriOf(values)} هـ</>}
          </span>
        </div>
      ),
    },
    {
      key: "to",
      node: (
        <p className="doc-p doc-letter-to">
          {t("{{letter_to_honorific}} / {{letter_to}} {{letter_to_suffix}}")}
        </p>
      ),
    },
    { key: "salutation", node: <p className="doc-p">{t("{{letter_salutation}}")}</p> },
    {
      key: "subject",
      keepWithNext: true,
      node: <p className="doc-letter-subject">الموضوع: {title}</p>,
    },
    ...paragraphs(body).map((para, i) => ({
      key: `p${i}`,
      node: <Para text={para} values={values} editing={editing} />,
    })),
    { key: "closing", node: <p className="doc-p">{t("{{letter_closing}}")}</p> },
    {
      key: "sign",
      keepWithPrev: true,
      node: (
        <div className="doc-letter-sign">
          <p className="font-semibold">{org.name}</p>
          <p>{v(values, "letter_signer_name") || v(values, "company_signer_name")}</p>
          <p>{v(values, "letter_signer_title") || v(values, "company_signer_title")}</p>
          <div className="doc-sign-area">
            {l.useOrgSignature && org.urls.signatureAsset && (
              <img src={org.urls.signatureAsset} alt="التوقيع" className="doc-sign-img" />
            )}
            {l.useOrgStamp && org.urls.stampAsset && (
              <img src={org.urls.stampAsset} alt="الختم" className="doc-stamp-img" />
            )}
          </div>
        </div>
      ),
    },
  ];
}

/** Hijri of the letter's own date (falls back to today's). */
function hijriOf(values: Resolved): ReactNode {
  return values.letter_date_hijri?.value || values.today_hijri?.value || "";
}
