import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { Icon } from "../products/icons";
import { ContactBand, SiteChrome, useLightTheme } from "./chrome";
import { RequestDialog } from "./RequestDialog";
import { siteProductQuery } from "./site-api";

const route = getRouteApi("/site/p/$slug");

const Head = ({ eyebrow, title, lead }: { eyebrow?: string; title: string; lead?: string }) => (
  <div className="head">
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2 className="h2">{title}</h2>
    {lead && <p className="lead">{lead}</p>}
  </div>
);

/** A product's public page: what it is, packages, how it runs, what you receive, and the request form. */
export function ProductPublicPage() {
  const { slug } = route.useParams();
  const q = useQuery(siteProductQuery(slug));
  const [open, setOpen] = useState(false);
  useLightTheme(q.data ? `${q.data.product.name} | ${q.data.site.brand.name}` : undefined);

  if (q.isPending)
    return (
      <div className="site-root">
        <div className="notready" role="status">
          <p className="small">جارٍ التحميل…</p>
        </div>
      </div>
    );
  if (!q.data)
    return (
      <div className="site-root" dir="rtl">
        <div className="notready">
          <h1 className="h2">الصفحة غير موجودة</h1>
          <Link to="/site" className="btn primary">
            العودة إلى الموقع
          </Link>
        </div>
      </div>
    );

  const { site, logoUrl, product } = q.data;
  const c = product.content;
  const target = { slug: product.slug, name: product.name, intake: c.intake };
  const cta = (
    <button type="button" className="btn primary" onClick={() => setOpen(true)}>
      اطلب عرضاً
      <ArrowLeft size={16} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <SiteChrome
        brand={site.brand}
        contact={site.contact}
        logoUrl={logoUrl}
        links={[{ href: "/site", label: "الرئيسية" }]}
        onRequest={() => setOpen(true)}
      >
        <section className="hero">
          <span className="eyebrow">{c.hero.eyebrow || "خدمة"}</span>
          <h1 className="h1" style={{ fontSize: "clamp(32px,5vw,60px)" }}>
            {c.hero.title || product.name}
          </h1>
          <p className="lead">{c.hero.subtitle || product.tagline}</p>
          {c.hero.tags.length > 0 && (
            <div className="btns" style={{ gap: 8 }}>
              {c.hero.tags.map((t) => (
                <span key={t} className="tag" style={{ fontSize: 14, padding: "8px 16px" }}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="btns">{cta}</div>
        </section>

        {c.problems.length > 0 && (
          <section className="sec">
            <Head eyebrow="لماذا هذه الخدمة" title="التحدي الذي نحلّه" />
            <div className="g4 stack">
              {c.problems.map((p) => (
                <div key={p.title} className="card">
                  <span className="icon">
                    <Icon name={p.icon} />
                  </span>
                  <h3 className="h3">{p.title}</h3>
                  <p className="body">{p.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.offerings.length > 0 && (
          <section className="sec">
            <Head eyebrow="ماذا نقدم" title="ما تحصل عليه الجهة" />
            <div className="g2">
              {c.offerings.map((o, i) => (
                <div key={o.title} className={`card${i === 0 ? " dark" : ""}`} style={{ gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      className="icon"
                      style={i === 0 ? { background: "var(--accent)", color: "#fff" } : undefined}
                    >
                      <Icon name={o.icon} />
                    </span>
                    <h3 className="h3">{o.title}</h3>
                  </div>
                  <div className="list">
                    {o.points.map((t) => (
                      <span key={t} className="li">
                        <Check aria-hidden="true" color="var(--accent)" />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.model.length > 0 && (
          <section className="sec">
            <Head eyebrow="نموذج التشغيل" title="نُدير الشبكة، ولا نُحمّلك التكلفة الثابتة" />
            <div className="g3">
              {c.model.map((m) => (
                <div key={m.title} className="card">
                  <h3 className="h3">{m.title}</h3>
                  <p className="body">{m.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.benefits.length > 0 && (
          <section className="sec">
            <Head eyebrow="كفاءة التكلفة" title="كيف نخفض التكلفة على الجهة" />
            <div className="g3">
              {c.benefits.map((b) => (
                <div key={b.title} className="card">
                  <span className="icon">
                    <Icon name={b.icon} />
                  </span>
                  <h3 className="h3">{b.title}</h3>
                  <p className="body">{b.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.comparison.length > 0 && (
          <section className="sec">
            <Head eyebrow="المقارنة" title="لماذا تُسند الجهة الخدمة بدل تشغيلها ذاتياً" />
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>المعيار</th>
                    <th>التشغيل الذاتي</th>
                    <th className="us">مع {site.brand.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.comparison.map((r) => (
                    <tr key={r.label}>
                      <td style={{ fontWeight: 700 }}>{r.label}</td>
                      <td>{r.self}</td>
                      <td className="us">{r.us}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {c.packages.length > 0 && (
          <section className="sec">
            <Head eyebrow="خيارات الخدمة" title="نماذج مرنة تناسب طبيعة المستفيدين" />
            <div className="g3">
              {c.packages.map((p) => (
                <div key={p.id} className={`card pkg${p.highlight ? " hi" : ""}`}>
                  {p.highlight && (
                    <span className="tag" style={{ alignSelf: "flex-start", background: "#fff" }}>
                      الأكثر شمولاً
                    </span>
                  )}
                  <h3 className="h3" style={{ fontSize: 22 }}>
                    {p.name}
                  </h3>
                  <p className="body">{p.audience}</p>
                  <div
                    className="list"
                    style={{ borderTop: "1px solid rgba(128,128,150,.25)", paddingTop: 14 }}
                  >
                    {p.features.map((f) => (
                      <span key={f} className="li">
                        <Check aria-hidden="true" color={p.highlight ? "#fff" : "var(--accent)"} />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.process.length > 0 && (
          <section className="sec">
            <Head eyebrow="آلية العمل" title="من استلام البيانات إلى التقرير الختامي" />
            <div className="g3" style={{ gap: 12 }}>
              {c.process.map((s, i) => (
                <div key={s.title} className="card step">
                  <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
                  <div className="list" style={{ gap: 6 }}>
                    <h3 className="h3">{s.title}</h3>
                    <p className="body">{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(c.roles.client.length > 0 || c.roles.us.length > 0) && (
          <section className="sec">
            <Head eyebrow="توزيع الأدوار" title="شراكة واضحة، ومسؤولية تنفيذ واحدة" />
            <div className="g2">
              <div className="card" style={{ gap: 16 }}>
                <h3 className="h3">دور الجهة</h3>
                <div className="list">
                  {c.roles.client.map((t, i) => (
                    <span key={t} className="li">
                      <b style={{ color: "var(--accent)" }}>{String(i + 1).padStart(2, "0")}</b>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card dark" style={{ gap: 16 }}>
                <h3 className="h3">دور {site.brand.name}</h3>
                <div className="list">
                  {c.roles.us.map((t, i) => (
                    <span key={t} className="li">
                      <b style={{ color: "#B9AEFF" }}>{String(i + 1).padStart(2, "0")}</b>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {c.standards.length > 0 && (
          <section className="sec">
            <Head eyebrow="معايير الخدمة" title="التزامات نبني عليها كل خدمة" />
            <div className="g3">
              {c.standards.map((s) => (
                <div key={s.title} className="card">
                  <span className="icon">
                    <Icon name={s.icon} />
                  </span>
                  <h3 className="h3">{s.title}</h3>
                  <p className="body">{s.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.proof.length > 0 && (
          <section className="sec">
            <Head eyebrow="تجربة منفذة" title="مشاريع منفذة، لا وعود" />
            <div className="g2">
              {c.proof.map((p) => (
                <article key={p.title} className="card" style={{ gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span className="tag">{p.entity}</span>
                    <span className="small">{p.beneficiaries}</span>
                  </div>
                  <h3 className="h3">{p.title}</h3>
                  <p className="body">{p.text}</p>
                  {p.scope.length > 0 && (
                    <div className="list" style={{ gap: 8 }}>
                      {p.scope.map((t) => (
                        <span key={t} className="li body">
                          <Check aria-hidden="true" color="var(--accent)" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {c.deliverables.length > 0 && (
          <section className="sec">
            <Head eyebrow="ما تستلمه الجهة" title="أثر يمكن قياسه وتوثيقه أمام المانحين" />
            <div className="g3">
              {c.deliverables.map((d) => (
                <div key={d.title} className="card">
                  <span className="icon">
                    <Icon name={d.icon} />
                  </span>
                  <h3 className="h3">{d.title}</h3>
                  <p className="body">{d.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.faq.length > 0 && (
          <section id="faq" className="sec">
            <Head title="أسئلة شائعة" />
            <div className="list" style={{ gap: 10, maxWidth: 760, margin: "0 auto" }}>
              {c.faq.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <span className="plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p className="body" style={{ paddingBottom: 18 }}>
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        <ContactBand
          title={site.cta.title || "جاهزون لنصمم لك العرض المناسب"}
          lead={
            c.intake.length > 0
              ? `${c.intake.length} معلومات تكفينا لإعداد عرض مخصص لجهتكم.`
              : site.cta.lead
          }
          contact={site.contact}
          onRequest={() => setOpen(true)}
        />
      </SiteChrome>
      <RequestDialog target={target} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
