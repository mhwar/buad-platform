import { Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import "./site.css";
import type { SiteContent } from "@buad/schema/site";
import { waLink } from "./site-api";

/** The site is always light and keeps the app's saved theme intact for when the user returns. */
export function useLightTheme(title?: string) {
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset.theme;
    const prevTitle = document.title;
    root.dataset.theme = "light";
    if (title) document.title = title;
    return () => {
      if (prevTheme) root.dataset.theme = prevTheme;
      document.title = prevTitle;
    };
  }, [title]);
}

type Chrome = {
  brand: SiteContent["brand"];
  contact: SiteContent["contact"];
  logoUrl: string;
  links?: { href: string; label: string }[];
  onRequest: () => void;
  children: ReactNode;
};

export function SiteChrome({ brand, contact, logoUrl, links = [], onRequest, children }: Chrome) {
  return (
    <div className="site-root" dir="rtl" style={{ ["--accent" as string]: brand.accent }}>
      <header className="nav">
        <nav className="wrap nav-in" aria-label="القائمة الرئيسية">
          <Link
            to="/site"
            aria-label={`${brand.name}، الصفحة الرئيسية`}
            style={{ display: "flex" }}
          >
            <img
              src={logoUrl}
              alt={`شعار ${brand.name}`}
              style={{ height: 40, width: 58, objectFit: "contain" }}
            />
          </Link>
          <div className="navlinks">
            {links.map((l) =>
              l.href.startsWith("/") ? (
                <Link key={l.href} to={l.href}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ),
            )}
          </div>
          {contact.whatsapp ? (
            <a
              className="nav-cta"
              href={waLink(contact.whatsapp)}
              aria-label="تحدث معنا عبر واتساب"
            >
              <MessageCircle size={18} aria-hidden="true" />
              <span className="navlabel">تحدث معنا</span>
            </a>
          ) : (
            <button
              type="button"
              className="nav-cta"
              onClick={onRequest}
              style={{ border: 0, font: "inherit" }}
            >
              اطلب عرضاً
            </button>
          )}
        </nav>
      </header>
      <main id="top" className="wrap">
        {children}
      </main>
      <footer className="wrap foot">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src={logoUrl} alt="" style={{ height: 36, width: 50, objectFit: "contain" }} />
          <span className="small">{brand.tagline}</span>
        </div>
        <span className="small">
          © {new Date().getFullYear()} {brand.name}
        </span>
      </footer>
    </div>
  );
}

export function ContactBand({
  title,
  lead,
  contact,
  onRequest,
  logoWhite = "/site/logo-white.png",
}: {
  title: string;
  lead: string;
  contact: SiteContent["contact"];
  onRequest: () => void;
  logoWhite?: string;
}) {
  return (
    <section id="contact" className="sec">
      <div className="cta">
        <img src={logoWhite} alt="" style={{ width: 96, height: 69, objectFit: "contain" }} />
        <h2 className="h2" style={{ fontSize: "clamp(28px,4.4vw,52px)" }}>
          {title}
        </h2>
        {lead && <p className="lead">{lead}</p>}
        <div className="btns">
          <button type="button" className="btn primary" onClick={onRequest}>
            اطلب عرضاً
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          {contact.whatsapp && (
            <a className="btn ghost-dark" href={waLink(contact.whatsapp)}>
              <MessageCircle size={18} aria-hidden="true" />
              <span dir="ltr">{contact.phone || contact.whatsapp}</span>
            </a>
          )}
          {contact.email && (
            <a className="btn white" href={`mailto:${contact.email}`}>
              <Mail size={18} aria-hidden="true" />
              <span dir="ltr">{contact.email}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
