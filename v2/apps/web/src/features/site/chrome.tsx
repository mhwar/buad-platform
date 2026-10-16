import { Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, Menu, MessageCircle, Phone, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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

type NavLink = { href: string; label: string };
type Chrome = {
  brand: SiteContent["brand"];
  contact: SiteContent["contact"];
  logoUrl: string;
  links?: NavLink[];
  /** The services, for the phone menu and the footer. */
  products?: { slug: string; name: string }[];
  onRequest: () => void;
  /** Wording of the main action («اطلب عرضاً», or «سجّل اهتمامك» for a coming-soon page). */
  ctaLabel?: string;
  children: ReactNode;
};

const SOCIAL_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
};

const Anchor = ({ l, onClick }: { l: NavLink; onClick?: () => void }) =>
  l.href.startsWith("/") ? (
    <Link to={l.href} onClick={onClick}>
      {l.label}
    </Link>
  ) : (
    <a href={l.href} onClick={onClick}>
      {l.label}
    </a>
  );

/**
 * The public frame: a floating header (links on wide screens, a menu on phones), the page,
 * a full footer, and on phones a bar that keeps «اطلب عرضاً» and WhatsApp a thumb away.
 */
export function SiteChrome({
  brand,
  contact,
  logoUrl,
  links = [],
  products = [],
  onRequest,
  ctaLabel = "اطلب عرضاً",
  children,
}: Chrome) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // The phone bar appears once the visitor has scrolled past the first screen.
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 480);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [menu]);
  const socials = Object.entries(contact.socials ?? {}).filter(([, v]) => v);
  const year = new Date().getFullYear();

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
              width={58}
              height={40}
              style={{ height: 40, width: 58, objectFit: "contain" }}
            />
          </Link>
          <div className="navlinks">
            {links.map((l) => (
              <Anchor key={l.href} l={l} />
            ))}
          </div>
          <div className="nav-actions">
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
                {ctaLabel}
              </button>
            )}
            <button
              type="button"
              className="nav-menu"
              aria-label="فتح القائمة"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </nav>
      </header>

      {menu && (
        <div
          className="drawer-scrim"
          onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}
        >
          <div className="drawer" role="dialog" aria-modal="true" aria-label="قائمة الموقع">
            <div className="drawer-head">
              <img
                src={logoUrl}
                alt=""
                width={50}
                height={36}
                style={{ height: 36, width: 50, objectFit: "contain" }}
              />
              <button
                type="button"
                className="nav-menu"
                aria-label="إغلاق القائمة"
                onClick={() => setMenu(false)}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="drawer-links">
              {links.map((l) => (
                <Anchor key={l.href} l={l} onClick={() => setMenu(false)} />
              ))}
            </div>
            {products.length > 0 && (
              <>
                <p className="small drawer-label">خدماتنا</p>
                <div className="drawer-links sub">
                  {products.map((p) => (
                    <Link
                      key={p.slug}
                      to="/site/p/$slug"
                      params={{ slug: p.slug }}
                      onClick={() => setMenu(false)}
                    >
                      {p.name}
                    </Link>
                  ))}
                </div>
              </>
            )}
            <div className="drawer-foot">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setMenu(false);
                  onRequest();
                }}
              >
                {ctaLabel}
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
              {contact.whatsapp && (
                <a className="btn white" href={waLink(contact.whatsapp)}>
                  <MessageCircle size={18} aria-hidden="true" />
                  واتساب
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <main id="top" className="wrap">
        {children}
      </main>

      <footer className="wrap foot">
        <div className="foot-brand">
          <img
            src={logoUrl}
            alt=""
            width={64}
            height={46}
            style={{ height: 46, width: 64, objectFit: "contain" }}
          />
          {brand.tagline && <p className="body">{brand.tagline}</p>}
          {socials.length > 0 && (
            <div className="socials">
              {socials.map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noreferrer">
                  {SOCIAL_LABEL[k] ?? k}
                </a>
              ))}
            </div>
          )}
        </div>
        {products.length > 0 && (
          <div className="foot-col">
            <p className="foot-title">خدماتنا</p>
            {products.map((p) => (
              <Link key={p.slug} to="/site/p/$slug" params={{ slug: p.slug }}>
                {p.name}
              </Link>
            ))}
          </div>
        )}
        {links.length > 0 && (
          <div className="foot-col">
            <p className="foot-title">روابط</p>
            {links.map((l) => (
              <Anchor key={l.href} l={l} />
            ))}
          </div>
        )}
        <div className="foot-col">
          <p className="foot-title">تواصل معنا</p>
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>
              <Phone size={14} aria-hidden="true" />
              <span dir="ltr">{contact.phone}</span>
            </a>
          )}
          {contact.whatsapp && (
            <a href={waLink(contact.whatsapp)}>
              <MessageCircle size={14} aria-hidden="true" />
              واتساب
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`}>
              <Mail size={14} aria-hidden="true" />
              <span dir="ltr">{contact.email}</span>
            </a>
          )}
        </div>
        <p className="small foot-copy">
          © {year} {brand.name}. جميع الحقوق محفوظة.
        </p>
      </footer>

      <div className={`mobile-bar${scrolled ? " on" : ""}`} aria-hidden={!scrolled}>
        <button
          type="button"
          className="btn primary"
          onClick={onRequest}
          tabIndex={scrolled ? 0 : -1}
        >
          {ctaLabel}
        </button>
        {contact.whatsapp && (
          <a
            className="btn white wa"
            href={waLink(contact.whatsapp)}
            aria-label="واتساب"
            tabIndex={scrolled ? 0 : -1}
          >
            <MessageCircle size={20} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ContactBand({
  title,
  lead,
  contact,
  onRequest,
  soon,
  logoWhite = "/site/logo-white.png",
}: {
  title: string;
  lead: string;
  contact: SiteContent["contact"];
  onRequest: () => void;
  /** A coming-soon product: register interest instead of asking for a quote. */
  soon?: boolean;
  logoWhite?: string;
}) {
  return (
    <section id="contact" className="sec">
      <div className="cta">
        <img
          src={logoWhite}
          alt=""
          width={96}
          height={69}
          style={{ width: 96, height: 69, objectFit: "contain" }}
        />
        <h2 className="h2" style={{ fontSize: "clamp(28px,4.4vw,52px)" }}>
          {title}
        </h2>
        {lead && <p className="lead">{lead}</p>}
        <div className="btns">
          <button type="button" className="btn primary" onClick={onRequest}>
            {soon ? "سجّل اهتمامك" : "اطلب عرضاً"}
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          {contact.whatsapp && (
            <a className="btn ghost-dark" href={waLink(contact.whatsapp)}>
              <MessageCircle size={18} aria-hidden="true" />
              <span dir="ltr">{contact.phone || contact.whatsapp}</span>
            </a>
          )}
          {contact.email && (
            <a className="btn ghost-dark" href={`mailto:${contact.email}`}>
              <Mail size={18} aria-hidden="true" />
              <span dir="ltr">{contact.email}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
