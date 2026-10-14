import type { ProductContent } from "@buad/schema/products";
import type { SiteContent } from "@buad/schema/site";
import { type ReactNode, useEffect, useRef, useState } from "react";
import "../site/site.css";
import "./brochure.css";

export type BrochureData = {
  name: string;
  tagline: string;
  content: ProductContent;
  brand: SiteContent["brand"];
  contact: SiteContent["contact"];
};

const Slide = ({
  kind,
  n,
  total,
  eyebrow,
  title,
  data,
  children,
}: {
  kind: "light" | "dark";
  n: number;
  total: number;
  eyebrow?: string;
  title?: string;
  data: BrochureData;
  children: ReactNode;
}) => (
  <div className="bro-frame">
    <section className={`bro-slide ${kind}`} aria-label={title ?? data.name}>
      {(eyebrow || title) && (
        <header className="flex-none">
          {eyebrow && (
            <p className="eyebrow">
              <span>{String(n).padStart(2, "0")}</span>
              <i />
              <span>{eyebrow}</span>
            </p>
          )}
          {title && <h2 style={{ marginTop: 18 }}>{title}</h2>}
        </header>
      )}
      {children}
      <div className="foot">
        <span>
          {data.brand.name} | {data.name}
        </span>
        <span dir="ltr">
          {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </section>
  </div>
);

const cols = (n: number, max = 4) => ({
  gridTemplateColumns: `repeat(${Math.min(Math.max(n, 1), max)}, minmax(0, 1fr))`,
});

/** The service profile as 16:9 slides (screen: scaled to fit; print/PDF: exact 1920×1080 pages). */
export function BrochureDeck({
  data,
  ready,
}: {
  data: BrochureData;
  ready?: (v: boolean) => void;
}) {
  const c = data.content;
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setScale(Math.min(1, e.contentRect.width / 1920)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The PDF renderer waits for this: fonts loaded and slides laid out.
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => live && ready?.(true));
    return () => {
      live = false;
    };
  }, [ready]);

  const accent = data.brand.accent;
  const slides: ((p: { n: number; total: number }) => ReactNode)[] = [];
  const add = (f: (p: { n: number; total: number }) => ReactNode) => slides.push(f);
  const A = { data };

  add((p) => (
    <Slide key="cover" kind="dark" eyebrow={undefined} {...p} {...A}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          justifyContent: "center",
          flex: 1,
        }}
      >
        <p className="eyebrow">
          <i />
          <span>{c.hero.eyebrow || "ملف تعريفي بالخدمة"}</span>
        </p>
        <h2 style={{ fontSize: 124, lineHeight: 1.45 }}>{c.hero.title || data.name}</h2>
        <p className="lead" style={{ maxWidth: 1250 }}>
          {c.hero.subtitle || data.tagline}
        </p>
        {c.hero.tags.length > 0 && (
          <div className="tags">
            {c.hero.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Slide>
  ));
  if (c.problems.length)
    add((p) => (
      <Slide
        key="problems"
        kind="light"
        eyebrow="لماذا هذه الخدمة"
        title="التحدي الذي نحلّه"
        {...p}
        {...A}
      >
        <div className="grid" style={cols(c.problems.length)}>
          {c.problems.map((x) => (
            <div key={x.title} className={`card${c.problems.length > 4 ? " small" : ""}`}>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.offerings.length)
    add((p) => (
      <Slide key="offer" kind="light" eyebrow="ماذا نقدم" title="ما تحصل عليه الجهة" {...p} {...A}>
        <div className="grid" style={cols(c.offerings.length, 2)}>
          {c.offerings.map((o, i) => (
            <div key={o.title} className={`card${i === 0 ? " dark" : ""}`}>
              <h3>{o.title}</h3>
              <div className="list">
                {o.points.map((t) => (
                  <span key={t} className="li">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.model.length)
    add((p) => (
      <Slide key="model" kind="light" eyebrow="نموذج التشغيل" title="كيف نشغّل الخدمة" {...p} {...A}>
        <div className="grid" style={cols(c.model.length, 3)}>
          {c.model.map((x) => (
            <div key={x.title} className="card">
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.benefits.length)
    add((p) => (
      <Slide
        key="benefits"
        kind="dark"
        eyebrow="كفاءة التكلفة"
        title="كيف نخفض التكلفة على الجهة"
        {...p}
        {...A}
      >
        <div
          className="grid"
          style={cols(Math.ceil(c.benefits.length / (c.benefits.length > 3 ? 2 : 1)), 3)}
        >
          {c.benefits.map((x) => (
            <div
              key={x.title}
              className="card dark small"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.14)",
              }}
            >
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.comparison.length)
    add((p) => (
      <Slide
        key="cmp"
        kind="light"
        eyebrow="المقارنة"
        title="لماذا تُسند الجهة الخدمة بدل تشغيلها ذاتياً"
        {...p}
        {...A}
      >
        <table>
          <thead>
            <tr>
              <th>المعيار</th>
              <th>التشغيل الذاتي</th>
              <th className="us">مع {data.brand.name}</th>
            </tr>
          </thead>
          <tbody>
            {c.comparison.map((r) => (
              <tr key={r.label}>
                <td style={{ fontWeight: 700 }}>{r.label}</td>
                <td style={{ color: "var(--muted)" }}>{r.self}</td>
                <td className="us">{r.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Slide>
    ));
  if (c.packages.length)
    add((p) => (
      <Slide
        key="pkgs"
        kind="light"
        eyebrow="خيارات الخدمة"
        title="نماذج مرنة تناسب طبيعة المستفيدين"
        {...p}
        {...A}
      >
        <div className="grid" style={cols(c.packages.length)}>
          {c.packages.map((x) => (
            <div key={x.id} className={`card${x.highlight ? " accent" : ""}`}>
              {x.highlight && <span className="chip">الأكثر شمولاً</span>}
              <h3 style={{ fontSize: 46 }}>{x.name}</h3>
              <p>{x.audience}</p>
              <div
                className="list"
                style={{ borderTop: "2px solid rgba(128,128,150,.25)", paddingTop: 24 }}
              >
                {x.features.map((f) => (
                  <span key={f} className="li">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.process.length)
    add((p) => (
      <Slide
        key="process"
        kind="dark"
        eyebrow="آلية العمل"
        title="من استلام البيانات إلى التقرير الختامي"
        {...p}
        {...A}
      >
        <div className="steps" style={cols(c.process.length, 6)}>
          {c.process.map((s, i) => (
            <div key={s.title} className="step">
              <div className="diamond">
                <span>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 style={{ fontSize: 36 }}>{s.title}</h3>
              <p className="lead" style={{ fontSize: 26 }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.roles.client.length || c.roles.us.length)
    add((p) => (
      <Slide
        key="roles"
        kind="light"
        eyebrow="توزيع الأدوار"
        title="شراكة واضحة، ومسؤولية تنفيذ واحدة"
        {...p}
        {...A}
      >
        <div className="grid" style={cols(2, 2)}>
          <div className="card" style={{ gap: 28 }}>
            <h3>دور الجهة</h3>
            <div className="list">
              {c.roles.client.map((t) => (
                <span key={t} className="li">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="card dark" style={{ gap: 28 }}>
            <h3>دور {data.brand.name}</h3>
            <div className="list">
              {c.roles.us.map((t) => (
                <span key={t} className="li">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Slide>
    ));
  if (c.standards.length)
    add((p) => (
      <Slide
        key="std"
        kind="light"
        eyebrow="معايير الخدمة"
        title="التزامات نبني عليها كل خدمة"
        {...p}
        {...A}
      >
        <div
          className="grid"
          style={cols(Math.ceil(c.standards.length / (c.standards.length > 3 ? 2 : 1)), 3)}
        >
          {c.standards.map((x) => (
            <div key={x.title} className="card small">
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.proof.length)
    add((p) => (
      <Slide
        key="proof"
        kind="light"
        eyebrow="تجربة منفذة"
        title={c.proof.length === 1 ? (c.proof[0]?.title ?? "") : "مشاريع منفذة، لا وعود"}
        {...p}
        {...A}
      >
        <div className="grid" style={cols(Math.min(c.proof.length, 2), 2)}>
          {c.proof.slice(0, 4).map((x) => (
            <div key={x.title} className="card small">
              <span className="chip" style={{ background: "#f0edff" }}>
                {x.entity}
              </span>
              {c.proof.length > 1 && <h3>{x.title}</h3>}
              <p>
                <b>{x.beneficiaries}</b>
              </p>
              <p>{x.text}</p>
              {x.scope.length > 0 && (
                <div className="list" style={{ gap: 8 }}>
                  {x.scope.map((t) => (
                    <span key={t} className="li" style={{ fontSize: 24 }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Slide>
    ));
  const deliver = [...c.deliverables, ...c.standards.filter(() => false)];
  if (deliver.length)
    add((p) => (
      <Slide
        key="deliver"
        kind="light"
        eyebrow="ما تستلمه الجهة"
        title="أثر يمكن قياسه وتوثيقه أمام المانحين"
        {...p}
        {...A}
      >
        <div
          className="grid"
          style={cols(Math.ceil(deliver.length / (deliver.length > 4 ? 2 : 1)), 3)}
        >
          {deliver.map((x) => (
            <div key={x.title} className="card small">
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </div>
          ))}
        </div>
      </Slide>
    ));
  if (c.intake.length)
    add((p) => (
      <Slide
        key="intake"
        kind="dark"
        eyebrow="لطلب عرض سعر"
        title={`${c.intake.length} معلومات تكفينا لإعداد عرض مخصص`}
        {...p}
        {...A}
      >
        <div className="grid" style={{ ...cols(2, 2), gap: 22 }}>
          {c.intake.map((q, i) => (
            <div key={q.key} className="qrow" style={{ color: "var(--ink)" }}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              <span>{q.label}</span>
            </div>
          ))}
        </div>
      </Slide>
    ));
  add((p) => (
    <Slide key="contact" kind="dark" {...p} {...A}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          justifyContent: "center",
          flex: 1,
        }}
      >
        <h2 style={{ fontSize: 104, lineHeight: 1.5 }}>
          جاهزون لنصمم لك
          <br />
          <span style={{ color: "#b9aeff" }}>العرض المناسب لجهتك</span>
        </h2>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {data.contact.phone && (
            <div className="qrow" style={{ color: "var(--ink)" }}>
              <b style={{ fontSize: 26 }}>الجوال وواتساب</b>
              <span dir="ltr">{data.contact.phone}</span>
            </div>
          )}
          {data.contact.email && (
            <div className="qrow" style={{ color: "var(--ink)" }}>
              <b style={{ fontSize: 26 }}>البريد الإلكتروني</b>
              <span dir="ltr">{data.contact.email}</span>
            </div>
          )}
        </div>
      </div>
    </Slide>
  ));

  return (
    <div
      className="bro"
      ref={box}
      style={{ ["--accent" as string]: accent, ["--s" as string]: scale }}
    >
      <div className="bro-stage">{slides.map((s, i) => s({ n: i + 1, total: slides.length }))}</div>
    </div>
  );
}
