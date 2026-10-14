import { type SiteContent, trustItems } from "@buad/schema/site";

export type EditorTab =
  | "overview"
  | "identity"
  | "home"
  | "services"
  | "works"
  | "form"
  | "seo"
  | "history";

export type HealthItem = {
  key: string;
  label: string;
  ok: boolean;
  /** What to do when it is not ok. */
  hint: string;
  /** The tab where it is fixed. */
  tab: EditorTab;
};

export type HealthContext = {
  /** Slugs of products that are published and listed on the site. */
  listedSlugs: string[];
  isPublished: boolean;
  changedSections: string[];
  staleRequests: number;
};

const between = (n: number, a: number, b: number) => n >= a && n <= b;

/** A short, honest checklist of what makes the site ready and trustworthy. Pure. */
export function siteHealth(c: SiteContent, ctx: HealthContext): HealthItem[] {
  const wa = c.contact.whatsapp.replace(/\D/g, "");
  const entities = trustItems(c.trust);
  const withLogo = entities.filter((e) => e.logoAsset).length;
  const brokenLinks = c.services.items.filter(
    (s) => s.productSlug && !ctx.listedSlugs.includes(s.productSlug),
  );
  return [
    {
      key: "whatsapp",
      label: "رقم واتساب صحيح بصيغة دولية",
      ok: wa.length >= 11 && wa.length <= 15,
      hint: "مثال: 966551234567 (بدون + أو أصفار)",
      tab: "identity",
    },
    {
      key: "email",
      label: "بريد إلكتروني للتواصل",
      ok: /^\S+@\S+\.\S+$/.test(c.contact.email),
      hint: "يظهر زر البريد في آخر الصفحة",
      tab: "identity",
    },
    {
      key: "hero",
      label: "عنوان رئيسي ووصف مختصر (40 إلى 220 حرفاً)",
      ok: !!c.hero.title.trim() && between(c.hero.lead.trim().length, 40, 220),
      hint: "الوصف الطويل يُتجاوز، والقصير جداً لا يشرح",
      tab: "home",
    },
    {
      key: "products",
      label: "منتج واحد على الأقل منشور في الموقع",
      ok: ctx.listedSlugs.length > 0,
      hint: "من «المنتجات والخدمات»: الحالة منشور + يظهر في الموقع",
      tab: "services",
    },
    {
      key: "links",
      label: "كل بطاقة خدمة مرتبطة بمنتج ظاهر",
      ok: brokenLinks.length === 0,
      hint: brokenLinks.length
        ? `بطاقات تشير إلى منتج غير منشور: ${brokenLinks.map((s) => s.title).join("، ")}`
        : "",
      tab: "services",
    },
    {
      key: "logos",
      label: "شعارات للجهات التي نفذنا معها",
      ok: entities.length === 0 || withLogo >= Math.ceil(entities.length / 2),
      hint: `${withLogo} من ${entities.length} جهة لها شعار`,
      tab: "works",
    },
    {
      key: "faq",
      label: "ثلاثة أسئلة شائعة على الأقل",
      ok: c.faq.items.filter((f) => f.q.trim() && f.a.trim()).length >= 3,
      hint: "الأسئلة تقلل الاستفسارات المتكررة",
      tab: "home",
    },
    {
      key: "seo-title",
      label: "عنوان البحث بين 20 و60 حرفاً",
      ok: between(c.seo.title.trim().length, 20, 60),
      hint: "هذا ما يظهر في Google وعند مشاركة الرابط",
      tab: "seo",
    },
    {
      key: "seo-desc",
      label: "وصف البحث بين 80 و160 حرفاً",
      ok: between(c.seo.description.trim().length, 80, 160),
      hint: "الأطول يُقتطع في نتائج البحث",
      tab: "seo",
    },
    {
      key: "published",
      label: "الموقع منشور وبلا تعديلات معلّقة",
      ok: ctx.isPublished && ctx.changedSections.length === 0,
      hint: ctx.isPublished ? "عندك تعديلات لم تُنشر بعد" : "لن يراه الزوار قبل النشر",
      tab: "overview",
    },
    {
      key: "requests",
      label: "لا طلبات جديدة متأخرة المتابعة",
      ok: ctx.staleRequests === 0,
      hint: `${ctx.staleRequests} طلب جديد مضى عليه أكثر من 3 أيام`,
      tab: "overview",
    },
  ];
}

export const healthScore = (items: HealthItem[]) =>
  items.length ? Math.round((items.filter((i) => i.ok).length / items.length) * 100) : 0;

/** Arabic names of the content sections, for «what changed since publish». */
export const SECTION_LABEL: Record<string, string> = {
  brand: "الهوية",
  contact: "التواصل",
  seo: "البحث والمشاركة",
  show: "الأقسام الظاهرة",
  hero: "الواجهة الأولى",
  trust: "الجهات والشعارات",
  why: "لماذا نحن",
  services: "الخدمات",
  method: "كيف نعمل",
  works: "الأعمال والأرقام",
  faq: "الأسئلة الشائعة",
  cta: "الدعوة الختامية",
  form: "نموذج الطلب",
};
