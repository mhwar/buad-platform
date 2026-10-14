import { z } from "zod";
import { iconSchema } from "./products";

/* ─────────────────────────────────────────────────────────────────────────────
 * The public website («الموقع التعريفي»). The owner edits a DRAFT and publishes it: visitors only
 * ever see the last published snapshot. Everything here is public by design; costs and prices
 * live in products.pricing and never enter this content.
 * ──────────────────────────────────────────────────────────────────────────── */

export const SITE_ACCENTS = ["#5B3FE0", "#0B1550", "#F04E23"] as const;

const s = (max: number, d = "") => z.string().trim().max(max).default(d);
const arr = <T extends z.ZodType>(t: T, max: number) => z.array(t).max(max).default([]);
const card = z.object({ title: s(140), text: s(500) });

export const siteContent = z.object({
  brand: z
    .object({
      name: s(80, "بُعد التمكين"),
      accent: z.enum(SITE_ACCENTS).default("#5B3FE0"),
      /** An uploaded asset id; empty = the bundled logo. */
      logoAsset: s(60),
      tagline: s(160),
    })
    .default({ name: "بُعد التمكين", accent: "#5B3FE0", logoAsset: "", tagline: "" }),
  contact: z
    .object({ phone: s(30), whatsapp: s(20), email: s(120) })
    .default({ phone: "", whatsapp: "", email: "" }),
  seo: z.object({ title: s(90), description: s(300) }).default({ title: "", description: "" }),
  show: z
    .object({
      trust: z.boolean().default(true),
      why: z.boolean().default(true),
      services: z.boolean().default(true),
      products: z.boolean().default(true),
      method: z.boolean().default(true),
      works: z.boolean().default(true),
      faq: z.boolean().default(true),
    })
    .default({
      trust: true,
      why: true,
      services: true,
      products: true,
      method: true,
      works: true,
      faq: true,
    }),
  hero: z
    .object({
      badge: s(80),
      title: s(120),
      accent: s(40),
      lead: s(400),
      primaryCta: s(40),
      secondaryCta: s(40),
    })
    .default({ badge: "", title: "", accent: "", lead: "", primaryCta: "", secondaryCta: "" }),
  trust: z
    .object({
      title: s(80),
      /** Legacy plain names; used only while `items` is empty. */
      names: arr(s(60), 12),
      /** Entities worked with: a name and (optionally) an uploaded logo. */
      items: arr(z.object({ name: s(60), logoAsset: s(60) }), 16),
    })
    .default({ title: "", names: [], items: [] }),
  why: z
    .object({
      eyebrow: s(60),
      title: s(140),
      without: z
        .object({ label: s(60), title: s(140), items: arr(s(140), 6) })
        .default({ label: "", title: "", items: [] }),
      with: z
        .object({ label: s(60), title: s(140), items: arr(s(140), 6) })
        .default({ label: "", title: "", items: [] }),
    })
    .default({
      eyebrow: "",
      title: "",
      without: { label: "", title: "", items: [] },
      with: { label: "", title: "", items: [] },
    }),
  services: z
    .object({
      eyebrow: s(60),
      title: s(140),
      lead: s(300),
      items: arr(
        z.object({
          title: s(100),
          text: s(300),
          icon: iconSchema.optional(),
          /** A published product this card links to. */
          productSlug: s(60),
          featured: z.boolean().default(false),
        }),
        12,
      ),
    })
    .default({ eyebrow: "", title: "", lead: "", items: [] }),
  method: z
    .object({ eyebrow: s(60), title: s(140), steps: arr(card, 8) })
    .default({ eyebrow: "", title: "", steps: [] }),
  works: z
    .object({
      eyebrow: s(60),
      title: s(140),
      items: arr(
        z.object({
          category: s(60),
          title: s(100),
          text: s(300),
          entity: s(100),
          beneficiaries: s(40),
        }),
        12,
      ),
      stats: arr(z.object({ value: s(20), label: s(60) }), 6),
    })
    .default({ eyebrow: "", title: "", items: [], stats: [] }),
  faq: z
    .object({
      title: s(100),
      lead: s(200),
      items: arr(z.object({ q: s(200), a: s(800) }), 12),
    })
    .default({ title: "", lead: "", items: [] }),
  cta: z.object({ title: s(140), lead: s(300) }).default({ title: "", lead: "" }),
});
export type SiteContent = z.infer<typeof siteContent>;

/** The entities to show: the logo-aware list, or the legacy names. */
export const trustItems = (t: SiteContent["trust"]) =>
  t.items.length ? t.items : t.names.map((name) => ({ name, logoAsset: "" }));

/** Every uploaded image the site uses (brand logo and entity logos). */
export const siteAssetIds = (c: SiteContent) =>
  [c.brand.logoAsset, ...c.trust.items.map((i) => i.logoAsset)].filter(Boolean);

export const sitePatch = z.object({ version: z.number().int().min(1), content: siteContent });

/** The org's starting website, from its own design brief. Shown until the owner edits and publishes. */
export const DEFAULT_SITE: SiteContent = siteContent.parse({
  brand: {
    name: "بُعد التمكين",
    accent: "#5B3FE0",
    tagline: "شريكك التنفيذي من الفكرة إلى الأثر",
  },
  contact: { phone: "+966 55 178 7768", whatsapp: "966551787768", email: "Info@baadaltamkin.com" },
  seo: {
    title: "بُعد التمكين | شريكك التنفيذي",
    description:
      "شريك تنفيذي واحد يتولى مشروعك كاملًا: نصمم نموذج تنفيذه، ونجمع الإدارة والتشغيل والتقنية واللوجستيات، ونسلّمه موثقًا ومكتملًا.",
  },
  hero: {
    badge: "+10 مشاريع منفذة لجهات وثقت بنا",
    title: "مشروعك علينا،\nمن الفكرة إلى",
    accent: "الأثر",
    lead: "شريك تنفيذي واحد يتولى مشروعك كاملًا: نصمم نموذج تنفيذه، ونجمع الإدارة والتشغيل والتقنية واللوجستيات، ونسلّمه موثقًا ومكتملًا.",
    primaryCta: "ابدأ مشروعك معنا",
    secondaryCta: "شاهد أعمالنا",
  },
  trust: {
    title: "جهات نفذنا معها مشاريع",
    items: ["جمعية جسد", "توفير الدواء", "خبرة التعليمية", "أجيالنا", "آفاق", "جمعية شكر"].map(
      (name) => ({ name, logoAsset: "" }),
    ),
  },
  why: {
    eyebrow: "لماذا بُعد التمكين",
    title: "مسؤولية واحدة بدل موردين كثيرين",
    without: {
      label: "بدون شريك تنفيذي",
      title: "أطراف متعددة، والمسؤولية موزعة",
      items: [
        "تنسيق يومي مع موردين كثر",
        "كل مورد ينفذ ما يُطلب منه فقط",
        "توثيق متفرق يصعّب التقرير للمانح",
      ],
    },
    with: {
      label: "مع بُعد التمكين",
      title: "شريك يفهم الهدف ويتحمل التنفيذ",
      items: [
        "نقطة تواصل واحدة طوال المشروع",
        "مسؤولية واضحة حتى الإغلاق والتسليم",
        "مخرجات وتقارير جاهزة للجهة والمانح",
      ],
    },
  },
  services: {
    eyebrow: "خدماتنا",
    title: "منظومة واحدة لخدمة مشروعك",
    lead: "نختار من قدراتنا ما يحتاجه مشروعك، ونديرها معًا تحت مسؤولية واحدة.",
    items: [
      {
        title: "إدارة وتنفيذ المشاريع",
        text: "التخطيط والمتابعة وإدارة الأطراف والمخرجات من الاستلام حتى الإغلاق.",
        icon: "briefcase",
        productSlug: "project-delivery",
      },
      {
        title: "التشغيل والإسناد",
        text: "تشكيل نموذج التشغيل وتوفير الموارد والخبرات المناسبة لكل مشروع.",
        icon: "users",
      },
      {
        title: "الحلول التقنية",
        text: "أدوات رقمية وذكاء اصطناعي تعمل داخل المشروع لا بجانبه.",
        icon: "code",
      },
      {
        title: "الخدمات اللوجستية",
        text: "توريد ونقل وسكن ومواقع وتجهيزات ومتطلبات ميدانية.",
        icon: "truck",
      },
      {
        title: "التسويق والاتصال",
        text: "المحتوى والدعوات والتغطية والتواصل المرتبط بالمشروع.",
        icon: "megaphone",
      },
      {
        title: "النقل والتسكين العلاجي",
        text: "خدمة متخصصة للجمعيات الصحية ومرضاها.",
        icon: "home",
        productSlug: "patient-transport",
        featured: true,
      },
    ],
  },
  method: {
    eyebrow: "كيف نعمل",
    title: "أنتم تحددون الهدف، ونحن ننفذ",
    steps: [
      { title: "نقيّم", text: "قيمة المشروع ومواءمته وقدرتنا على تحقيقه." },
      { title: "نفهم", text: "النطاق والمستفيدين والمتطلبات والتحديات." },
      { title: "نصمم التنفيذ", text: "النموذج والموارد والشركاء وآلية العمل." },
      { title: "نُسند ونجهّز", text: "نفعّل الموردين والخبراء والخدمات المطلوبة." },
      { title: "ننفذ وندير", text: "نقود التنفيذ ونتابع المنجزات والمتغيرات." },
      { title: "نوثّق ونسلّم", text: "مخرجات وتقارير وتسليم واضح للجهة." },
    ],
  },
  works: {
    eyebrow: "من أعمالنا",
    title: "مشاريع منفذة، لا وعود",
    items: [
      {
        category: "الفعاليات",
        title: "ملتقى الصيادلة",
        text: "المقر والدعوات والمعرض والمحتوى والتكريم واللوجستيات، تحت مسؤولية واحدة.",
        entity: "جمعية توفير الدواء",
        beneficiaries: "80 مستفيدًا",
      },
      {
        category: "الصحة واللوجستيات",
        title: "مشروع رساء",
        text: "سكن ونقل للمرضى طوال فترة علاجهم، باحتياج مستمر وحساس.",
        entity: "جمعية جسد",
        beneficiaries: "50 مستفيدًا",
      },
      {
        category: "البرامج الطلابية",
        title: "أكاديمية ق",
        text: "برنامج ممتد متعدد الأنشطة والرحلات، بتجربة متسقة ومخرجات موثقة.",
        entity: "جمعية أجيالنا",
        beneficiaries: "60 مستفيدًا",
      },
      {
        category: "التعليم",
        title: "الكفالة التعليمية",
        text: "توريد المستلزمات والأجهزة وتسليمها وتوثيقها خلال ثلاثة أشهر.",
        entity: "جمعية خبرة التعليمية",
        beneficiaries: "40 مستفيدًا تقريبًا",
      },
    ],
    stats: [
      { value: "+10", label: "مشاريع منفذة" },
      { value: "+300", label: "مستفيد تقريبًا" },
      { value: "+6", label: "مجالات تنفيذ" },
      { value: "2026", label: "عام الانطلاق" },
    ],
  },
  faq: {
    title: "قبل أن تبدأ معنا",
    lead: "إجابات مختصرة على أكثر ما تسألنا عنه الجهات.",
    items: [
      {
        q: "ما الفرق بينكم وبين المورد العادي؟",
        a: "المورد ينفذ ما يُطلب منه. نحن نتسلم المشروع كاملًا، نصمم نموذج تنفيذه، وندير كل أطرافه، ونتحمل مسؤوليته حتى التسليم.",
      },
      {
        q: "كيف تحسبون تكلفة المشروع؟",
        a: "بعد فهم المشروع نقدم نموذج التنفيذ وتكلفته بوضوح: التكلفة الفعلية مع رسوم إدارة، أو باقة ثابتة، حسب ما يناسب الجهة وميزانيتها.",
      },
      {
        q: "كيف نتابع تقدم المشروع؟",
        a: "نقطة تواصل واحدة طوال المشروع، وتقارير دورية بالمنجزات والمتطلبات، وتقرير ختامي موثق عند التسليم.",
      },
      {
        q: "هل تملكون أسطول نقل؟",
        a: "لا، وهذه ميزة للجهة: نشغّل النقل عبر منصة نقل ذكي بحساب أعمال ومزودين مرخصين، فتدفع الجهة مقابل الاستخدام الفعلي دون تكاليف ثابتة.",
      },
    ],
  },
  cta: {
    title: "مشروعك القادم يستحق\nتنفيذًا يليق بأهدافه",
    lead: "أخبرنا عن مشروعك، ونعود إليك بنموذج التنفيذ المناسب وتكلفته.",
  },
});
