import { trustItems } from "@buad/schema/site";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { useState } from "react";
import { Icon } from "../products/icons";
import { ContactBand, SiteChrome, useLightTheme } from "./chrome";
import { fontLine, useFontStatus } from "./font-status";
import { RequestDialog } from "./RequestDialog";
import { interestForm, type RequestTarget, siteHomeQuery } from "./site-api";

const NavLinks = (show: Record<string, boolean>, hasProducts: boolean) =>
  [
    show.services && { href: "#services", label: "الخدمات" },
    show.products && hasProducts && { href: "#products", label: "منتجاتنا" },
    show.method && { href: "#method", label: "كيف نعمل" },
    show.works && { href: "#work", label: "أعمالنا" },
    show.faq && { href: "#faq", label: "أسئلة شائعة" },
  ].filter(Boolean) as { href: string; label: string }[];

/** The public home page: the published site (or, for signed-in managers, `?preview=1` = the draft). */
export function SitePage() {
  const { preview, fonts } = useSearch({ strict: false }) as { preview?: boolean; fonts?: boolean };
  const fontStatus = useFontStatus();
  const q = useQuery(siteHomeQuery(!!preview));
  const published = q.data?.published ? q.data : null;
  useLightTheme(published?.site.seo.title || published?.site.brand.name);
  const [req, setReq] = useState<{ open: boolean; target: RequestTarget }>({
    open: false,
    target: null,
  });

  if (q.isPending)
    return (
      <div className="site-root">
        <div className="notready" role="status">
          <p className="small">جارٍ التحميل…</p>
        </div>
      </div>
    );
  if (!published)
    return (
      <div className="site-root" dir="rtl">
        <div className="notready">
          <img src="/site/logo.png" alt="" style={{ width: 120 }} />
          <h1 className="h2">
            {q.isError && preview ? "سجّل الدخول لمعاينة الموقع" : "الموقع قيد الإعداد"}
          </h1>
          <p className="lead">سيكون متاحاً هنا قريباً.</p>
        </div>
      </div>
    );

  const { site, logoUrl, products } = published;
  const open = (target: RequestTarget = null) => setReq({ open: true, target });

  return (
    <>
      {preview && (
        <div
          role="status"
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            zIndex: 60,
            background: "#12142b",
            color: "#fff",
            padding: "10px 16px",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          معاينة المسودة: لا يراها الزوار قبل النشر · {fontLine(fontStatus)} ·{" "}
          <Link to="/website" style={{ textDecoration: "underline" }}>
            العودة إلى إدارة الموقع
          </Link>
        </div>
      )}
      {fonts && !preview && (
        <div
          role="status"
          style={{
            position: "fixed",
            insetInline: 12,
            bottom: 12,
            zIndex: 60,
            background: "#12142b",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 12,
            textAlign: "center",
            fontSize: 14,
          }}
        >
          {fontLine(fontStatus)}
        </div>
      )}
      <SiteChrome
        brand={site.brand}
        contact={site.contact}
        logoUrl={logoUrl}
        links={NavLinks(site.show, products.length > 0)}
        onRequest={() => open()}
      >
        <section className="hero">
          {site.hero.badge && (
            <div className="badge">
              <i aria-hidden="true" />
              {site.hero.badge}
            </div>
          )}
          <h1 className="h1">
            {site.hero.title} <span style={{ color: "var(--accent)" }}>{site.hero.accent}</span>
          </h1>
          <p className="lead">{site.hero.lead}</p>
          <div className="btns">
            <button type="button" className="btn primary" onClick={() => open()}>
              {site.hero.primaryCta || "اطلب عرضاً"}
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            {site.show.works && site.hero.secondaryCta && (
              <a href="#work" className="btn white">
                {site.hero.secondaryCta}
              </a>
            )}
          </div>
        </section>

        {site.show.trust && trustItems(site.trust).length > 0 && (
          <section aria-label={site.trust.title} style={{ paddingTop: "clamp(56px,7vw,88px)" }}>
            <p className="small" style={{ margin: "0 0 16px", textAlign: "center" }}>
              {site.trust.title}
            </p>
            <div className="g6">
              {trustItems(site.trust).map((n) => (
                <div key={n.name} className={`trust-name${n.logoAsset ? " has-logo" : ""}`}>
                  {n.logoAsset ? (
                    <img
                      className="trust-logo"
                      src={`/api/public/site/assets/${n.logoAsset}`}
                      alt={n.name}
                      loading="lazy"
                    />
                  ) : (
                    n.name
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {site.show.why && (site.why.without.items.length > 0 || site.why.with.items.length > 0) && (
          <section className="sec" aria-label={site.why.title}>
            <div className="head">
              <span className="eyebrow">{site.why.eyebrow}</span>
              <h2 className="h2">{site.why.title}</h2>
            </div>
            <div className="g2">
              <div className="card" style={{ gap: 16 }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {site.why.without.label}
                </span>
                <h3 className="h3">{site.why.without.title}</h3>
                <div className="list">
                  {site.why.without.items.map((t) => (
                    <span key={t} className="li body">
                      <X aria-hidden="true" color="#B4441E" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card accent" style={{ gap: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#E5E0FF" }}>
                  {site.why.with.label}
                </span>
                <h3 className="h3">{site.why.with.title}</h3>
                <div className="list">
                  {site.why.with.items.map((t) => (
                    <span key={t} className="li">
                      <Check aria-hidden="true" />
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {site.show.services && site.services.items.length > 0 && (
          <section id="services" className="sec">
            <div className="head">
              <span className="eyebrow">{site.services.eyebrow}</span>
              <h2 className="h2">{site.services.title}</h2>
              {site.services.lead && <p className="lead">{site.services.lead}</p>}
            </div>
            <div className="g3">
              {site.services.items.map((s) => {
                const linked = s.productSlug && products.some((p) => p.slug === s.productSlug);
                const inner = (
                  <>
                    <span
                      className="icon"
                      style={
                        s.featured ? { background: "var(--accent)", color: "#fff" } : undefined
                      }
                    >
                      <Icon name={s.icon} />
                    </span>
                    <h3 className="h3" style={{ paddingTop: 4 }}>
                      {s.title}
                      {products.find((p) => p.slug === s.productSlug)?.comingSoon && (
                        <span
                          className="tag"
                          style={{ marginInlineStart: 10, verticalAlign: "middle" }}
                        >
                          قريباً
                        </span>
                      )}
                    </h3>
                    <p className="body" style={s.featured ? { color: "#C9CBDD" } : undefined}>
                      {s.text}
                    </p>
                    {linked && (
                      <span
                        style={{
                          marginTop: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 14,
                          fontWeight: 700,
                          color: s.featured ? "#C9C2FF" : "var(--accent)",
                        }}
                      >
                        تعرّف على الخدمة <ArrowLeft size={14} aria-hidden="true" />
                      </span>
                    )}
                  </>
                );
                const cls = `card${s.featured ? " dark" : ""}`;
                return linked ? (
                  <Link
                    key={s.title}
                    to="/site/p/$slug"
                    params={{ slug: s.productSlug }}
                    className={cls}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={s.title} className={cls}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {site.show.products && products.length > 0 && (
          <section id="products" className="sec">
            {products.map((p) => (
              <div key={p.slug} className="band">
                <div className="list" style={{ gap: 18 }}>
                  <span
                    className="eyebrow"
                    style={{
                      alignSelf: "flex-start",
                      background: "#1C2675",
                      borderColor: "#1C2675",
                      color: "#C9C2FF",
                    }}
                  >
                    {p.hero.eyebrow || "خدمة متخصصة"}
                    {p.comingSoon && (
                      <b style={{ marginInlineStart: 10, color: "#fff" }}>· قريباً</b>
                    )}
                  </span>
                  <h2 className="h2">{p.hero.title || p.name}</h2>
                  <p className="lead">{p.hero.subtitle || p.tagline}</p>
                  <div className="btns" style={{ justifyContent: "flex-start", paddingTop: 6 }}>
                    <button
                      type="button"
                      className="btn white"
                      onClick={() =>
                        open({
                          slug: p.slug,
                          name: p.name,
                          intake: p.intake,
                          comingSoon: p.comingSoon,
                        })
                      }
                    >
                      {p.comingSoon ? "سجّل اهتمامك" : "اطلب عرضاً"}
                    </button>
                    <Link to="/site/p/$slug" params={{ slug: p.slug }} className="btn ghost-dark">
                      تفاصيل الخدمة
                    </Link>
                  </div>
                </div>
                {p.hero.tags.length > 0 && (
                  <div className="tiles">
                    {p.hero.tags.map((t) => (
                      <div key={t} className="tile">
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {site.show.method && site.method.steps.length > 0 && (
          <section id="method" className="sec">
            <div className="head">
              <span className="eyebrow">{site.method.eyebrow}</span>
              <h2 className="h2">{site.method.title}</h2>
            </div>
            <div className="g3" style={{ gap: 12 }}>
              {site.method.steps.map((s, i) => {
                const last = i === site.method.steps.length - 1;
                return (
                  <div key={s.title} className={`card step${last ? " accent" : ""}`}>
                    <span className="step-n" style={last ? { color: "#fff" } : undefined}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="list" style={{ gap: 6 }}>
                      <h3 className="h3">{s.title}</h3>
                      <p className="body" style={last ? { color: "#F1EEFF" } : undefined}>
                        {s.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {site.show.works && (site.works.items.length > 0 || site.works.stats.length > 0) && (
          <section id="work" className="sec">
            <div className="head">
              <span className="eyebrow">{site.works.eyebrow}</span>
              <h2 className="h2">{site.works.title}</h2>
            </div>
            <div className="g4 stack">
              {site.works.items.map((w) => (
                <article key={w.title} className="card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span className="tag">{w.category}</span>
                    <span className="small">{w.beneficiaries}</span>
                  </div>
                  <h3 className="h3" style={{ paddingTop: 4 }}>
                    {w.title}
                  </h3>
                  <p className="body">{w.text}</p>
                  <span
                    className="small"
                    style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #EEEEF2" }}
                  >
                    {w.entity}
                  </span>
                </article>
              ))}
            </div>
            {site.works.stats.length > 0 && (
              <div className="g4" style={{ paddingTop: 16 }}>
                {site.works.stats.map((s, i) => (
                  <div
                    key={s.label}
                    className={`card${i === 0 ? " dark" : i === site.works.stats.length - 1 ? " accent" : ""}`}
                    style={{ gap: 4 }}
                  >
                    <span className="stat">{s.value}</span>
                    <span
                      className="small"
                      style={
                        i === 0 || i === site.works.stats.length - 1
                          ? { color: "#E5E0FF" }
                          : undefined
                      }
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {site.show.faq && site.faq.items.length > 0 && (
          <section id="faq" className="sec">
            <div className="g2" style={{ gap: "clamp(24px,4vw,48px)", alignItems: "start" }}>
              <div className="list" style={{ gap: 14 }}>
                <span className="eyebrow" style={{ alignSelf: "flex-start" }}>
                  أسئلة شائعة
                </span>
                <h2 className="h2">{site.faq.title}</h2>
                {site.faq.lead && <p className="lead">{site.faq.lead}</p>}
              </div>
              <div className="list" style={{ gap: 10 }}>
                {site.faq.items.map((f) => (
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
            </div>
          </section>
        )}

        <ContactBand
          title={site.cta.title}
          lead={site.cta.lead}
          contact={site.contact}
          onRequest={() => open()}
        />
        {/* Inside the site wrapper so its styles apply to the dialog. */}
        <RequestDialog
          form={req.target?.comingSoon ? interestForm(site.form) : site.form}
          target={req.target}
          open={req.open}
          onClose={() => setReq((r) => ({ ...r, open: false }))}
        />
      </SiteChrome>
    </>
  );
}
