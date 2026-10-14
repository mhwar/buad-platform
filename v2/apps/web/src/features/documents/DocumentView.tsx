import { type Resolved, segments } from "@buad/domain";
import type { Clause, DocLayout } from "@buad/schema/documents";
import { Fragment, type ReactNode } from "react";

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

/**
 * One renderer for the screen preview and for printing.
 * The page is a table: <thead>/<tfoot> repeat the letterhead on every printed page.
 */
export function DocumentView(p: Props) {
  const { layout: l, values, org } = p;
  const header = l.showHeader && org.urls.headerAsset;
  const footer = l.showFooter && (org.urls.footerAsset || l.footerLabel);
  const style = {
    "--doc-fs": `${l.fontSize}pt`,
    "--doc-lh": l.lineHeight,
    "--doc-mx": `${l.marginX}cm`,
  } as React.CSSProperties;
  return (
    <article className="doc-sheet" style={style} dir="rtl" aria-label={p.title}>
      {p.approved && <div className="doc-watermark-approved">معتمد</div>}
      <table className="doc-table">
        <thead>
          <tr>
            <td>
              {header ? (
                <img src={org.urls.headerAsset} alt="" className="doc-band" />
              ) : (
                <div className="doc-band-space" />
              )}
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              {footer ? (
                <div className="doc-footer">
                  {org.urls.footerAsset && l.showFooter && (
                    <img src={org.urls.footerAsset} alt="" className="doc-band" />
                  )}
                  {l.footerLabel && <span className="doc-footer-label">{l.footerLabel}</span>}
                </div>
              ) : (
                <div className="doc-band-space" />
              )}
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="doc-body">
              {p.kind === "contract" ? <Contract {...p} /> : <Letter {...p} />}
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

function Contract({ title, content, layout: l, values, editing, org }: Props) {
  return (
    <>
      <h1 className="doc-title" style={{ fontSize: `${l.titleSize}pt` }}>
        {title}
      </h1>
      {content.map((c) => (
        <section key={c.id} className={`doc-clause ${c.pageBreak ? "doc-page-break" : ""}`}>
          {(c.title || c.baseTitle) && (
            <h2 className="doc-clause-title" style={{ fontSize: `${l.clauseTitleSize}pt` }}>
              {c.title || c.baseTitle}
            </h2>
          )}
          {paragraphs(c.content).map((para, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one clause
            <p key={i} className="doc-p">
              {para.split("\n").map((line, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines of one paragraph
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Text text={line} values={values} editing={editing} />
                </Fragment>
              ))}
            </p>
          ))}
        </section>
      ))}
      {l.showSignatures && (
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
      )}
    </>
  );
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

function Letter({ number, title, content, layout: l, values, editing, org }: Props) {
  const body = content[0]?.content ?? "";
  const date = v(values, "letter_date");
  return (
    <div className="doc-letter">
      <div className="doc-letter-meta">
        <span>الرقم: {number}</span>
        <span>
          التاريخ: {date ? date.split("-").reverse().join("/") : "—"}
          {values.today_hijri && date && <> الموافق {hijriOf(values)} هـ</>}
        </span>
      </div>
      <p className="doc-p doc-letter-to">
        <Text
          text="{{letter_to_honorific}} / {{letter_to}} {{letter_to_suffix}}"
          values={values}
          editing={editing}
        />
      </p>
      <p className="doc-p">
        <Text text="{{letter_salutation}}" values={values} editing={editing} />
      </p>
      <p className="doc-letter-subject">الموضوع: {title}</p>
      {paragraphs(body).map((para, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of the body
        <p key={i} className="doc-p">
          <Text text={para} values={values} editing={editing} />
        </p>
      ))}
      <p className="doc-p">
        <Text text="{{letter_closing}}" values={values} editing={editing} />
      </p>
      <div className="doc-letter-sign">
        <p className="font-semibold">{org.name}</p>
        <p>{v(values, "company_signer_name")}</p>
        <p>{v(values, "company_signer_title")}</p>
        <div className="doc-sign-area">
          {l.useOrgSignature && org.urls.signatureAsset && (
            <img src={org.urls.signatureAsset} alt="التوقيع" className="doc-sign-img" />
          )}
          {l.useOrgStamp && org.urls.stampAsset && (
            <img src={org.urls.stampAsset} alt="الختم" className="doc-stamp-img" />
          )}
        </div>
      </div>
    </div>
  );
}

/** Hijri of the letter's own date (falls back to today's). */
function hijriOf(values: Resolved): ReactNode {
  return values.letter_date_hijri?.value || values.today_hijri?.value || "";
}
