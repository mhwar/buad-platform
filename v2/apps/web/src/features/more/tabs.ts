import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  Clock,
  House,
  Landmark,
  Receipt,
  Settings,
  ShoppingCart,
  Target,
  Truck,
  UserSquare,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

type Icon = ComponentType<{ className?: string }>;
/** The current URL's query, as far as navigation needs it (finance tabs live in `?tab=`). */
export type NavSearch = Record<string, string | undefined>;

/** A page inside a section: a tab on phones, a child of the section in the sidebar. */
export type SectionTab = {
  key: string;
  label: string;
  to: string;
  /** Query that selects this page when it shares a path with its siblings. */
  search?: Record<string, string>;
  /** What this page is for, and when to open it: shown under the tabs. */
  desc: string;
  when: string;
  perm?: string;
  /** `/api/attention` keys whose counts badge the tab. */
  attention?: string[];
  /** True for the list page itself, false for detail pages (no tabs there). */
  match: (path: string, search?: NavSearch) => boolean;
};

/** One entry of the sidebar. Its pages open under it as a drop-down. */
export type Section = {
  key: string;
  label: string;
  to: string;
  icon: Icon;
  hint: string;
  /** Needed to see the section at all (tabs may need more). */
  perm?: string;
  attention?: string[];
  tabs?: SectionTab[];
  /** Show the tab strip above the section's list pages (sections with their own in-page navigation say no). */
  strip?: boolean;
  /** True for every path that belongs to the section, details included. */
  match: (path: string) => boolean;
};

const exact = (to: string) => (p: string) => p === to;
const within = (to: string) => (p: string) => p === to || p.startsWith(`${to}/`);
const financeTab = (tab: string) => (p: string, s?: NavSearch) =>
  p === "/finance" && (s?.tab ?? "projects") === tab;

export const SECTIONS: Section[] = [
  {
    key: "home",
    label: "الرئيسية",
    to: "/",
    icon: House,
    hint: "ملخص يومك وما يحتاج انتباهك",
    match: exact("/"),
  },
  {
    key: "sales",
    label: "المبيعات",
    to: "/sales",
    icon: ShoppingCart,
    hint: "الفرص والعملاء وعروض الأسعار",
    match: (p) => within("/sales")(p) || within("/clients")(p),
    tabs: [
      {
        key: "overview",
        label: "اللوحة",
        to: "/sales",
        perm: "sales.view",
        desc: "أرقام المبيعات: القمع والتحويل والمكسوب والعروض، وما يحتاج تصرفاً اليوم.",
        when: "كل صباح: لتعرف أين تقف مبيعاتك.",
        match: exact("/sales"),
      },
      {
        key: "pipeline",
        label: "الفرص",
        to: "/sales/pipeline",
        perm: "sales.view",
        attention: ["requests"],
        desc: "مسار العميل المحتمل من الطلب إلى العقد، تنقل بطاقاته بين المراحل.",
        when: "عند وصول طلب جديد أو متابعة فرصة.",
        match: exact("/sales/pipeline"),
      },
      {
        key: "clients",
        label: "العملاء",
        to: "/clients",
        perm: "clients.view",
        desc: "ملفات العملاء وجهات الاتصال والمشاريع وكشوف الحسابات.",
        when: "عند إضافة عميل أو البحث عن ملفه.",
        match: exact("/clients"),
      },
      {
        key: "followups",
        label: "المتابعات",
        to: "/sales/followups",
        perm: "clients.view",
        attention: ["followups"],
        desc: "من ينتظر ردّنا: عملاء وفرصاً، المتأخر منها أولاً.",
        when: "كل صباح: لمعرفة من تتصل به اليوم.",
        match: exact("/sales/followups"),
      },
      {
        key: "quotes",
        label: "عروض الأسعار",
        to: "/sales/quotes",
        perm: "sales.view",
        desc: "عروض الأسعار المرسلة وحالتها وطباعتها.",
        when: "عند إعداد عرض أو متابعة ما أُرسل.",
        match: exact("/sales/quotes"),
      },
    ],
  },
  {
    key: "projects",
    label: "المشاريع",
    to: "/projects",
    icon: Briefcase,
    hint: "المشاريع ومراحلها ومهامها ومستنداتها",
    perm: "projects.view",
    match: (p) => within("/projects")(p) || within("/tasks")(p) || within("/documents")(p),
    tabs: [
      {
        key: "list",
        label: "المشاريع",
        to: "/projects",
        perm: "projects.view",
        attention: ["overdue"],
        desc: "كل المشاريع بحالتها وقيمتها وعميلها.",
        when: "لمتابعة المشاريع الجارية أو إضافة مشروع.",
        match: exact("/projects"),
      },
      {
        key: "tasks",
        label: "المهام",
        to: "/tasks",
        perm: "tasks.view",
        attention: ["tasks"],
        desc: "مهام الفريق عبر المشاريع وعمل الشركة، ومن المسؤول عنها وموعدها.",
        when: "يومياً: لمعرفة ما عليك وما تأخّر.",
        match: exact("/tasks"),
      },
      {
        key: "documents",
        label: "المستندات",
        to: "/documents",
        perm: "documents.view",
        attention: ["docs"],
        desc: "العقود والخطابات والصادر، من الإنشاء حتى الاعتماد والإرسال.",
        when: "عند إعداد عقد أو خطاب أو البحث عن مستند سابق.",
        match: exact("/documents"),
      },
    ],
  },
  {
    key: "finance",
    label: "المالية",
    to: "/finance",
    icon: Landmark,
    hint: "مالية الجهة والتحصيل والشركاء والضريبة",
    perm: "treasury.view",
    strip: false,
    match: within("/finance"),
    tabs: [
      {
        key: "projects",
        label: "المشاريع",
        to: "/finance",
        desc: "أرباح المشاريع وقيم العقود.",
        when: "لقراءة أداء المشاريع مالياً.",
        match: financeTab("projects"),
      },
      {
        key: "quarter",
        label: "توزيع الربع",
        to: "/finance",
        search: { tab: "quarter" },
        desc: "ما تحقّق في الربع وما يُوزَّع.",
        when: "عند إقفال الربع.",
        match: financeTab("quarter"),
      },
      {
        key: "vat",
        label: "الضريبة",
        to: "/finance",
        search: { tab: "vat" },
        desc: "ضريبة القيمة المضافة الربع سنوية.",
        when: "عند تجهيز الإقرار.",
        match: financeTab("vat"),
      },
      {
        key: "company",
        label: "الشركة",
        to: "/finance",
        search: { tab: "company" },
        desc: "دخل الشركة ومصروفاتها.",
        when: "لمتابعة مالية الشركة.",
        match: financeTab("company"),
      },
      {
        key: "partners",
        label: "الشركاء والتوزيع",
        to: "/finance",
        search: { tab: "partners" },
        desc: "حصص الشركاء وتوزيع الأرباح.",
        when: "عند التوزيع.",
        match: financeTab("partners"),
      },
      {
        key: "receivables",
        label: "التحصيل والتدفق",
        to: "/finance",
        search: { tab: "receivables" },
        attention: ["instalments"],
        desc: "الدفعات المنتظرة وأعمار الديون وتوقّع النقد.",
        when: "أسبوعياً: لمعرفة من يجب متابعته.",
        match: financeTab("receivables"),
      },
    ],
  },
  {
    key: "planning",
    label: "التخطيط",
    to: "/plans",
    icon: Target,
    hint: "الخطط وما نقدّمه من خدمات وكيف نعرضه",
    match: (p) => within("/plans")(p) || within("/products")(p) || within("/website")(p),
    tabs: [
      {
        key: "plans",
        label: "الخطط",
        to: "/plans",
        perm: "plans.view",
        attention: ["initiatives"],
        desc: "الخطة الاستراتيجية والتشغيلية بأهدافها ومؤشراتها.",
        when: "عند وضع أهداف السنة أو مراجعة التقدّم كل ربع.",
        match: exact("/plans"),
      },
      {
        key: "products",
        label: "المنتجات والخدمات",
        to: "/products",
        perm: "products.view",
        desc: "ما تقدّمه الشركة: الباقات والتسعير الداخلي وأداء كل خدمة.",
        when: "عند تعديل خدمة أو تسعيرها أو قراءة أدائها.",
        match: exact("/products"),
      },
      {
        key: "website",
        label: "الموقع",
        to: "/website",
        perm: "site.view",
        desc: "الموقع التعريفي العام: المحتوى والمعاينة والنشر وسجل النسخ.",
        when: "عند تحديث الموقع أو نشر تغيير.",
        match: exact("/website"),
      },
    ],
  },
  {
    key: "settings",
    label: "الإعدادات",
    to: "/settings",
    icon: Settings,
    hint: "بيانات الجهة والفريق والصلاحيات وسجل النشاط والمظهر",
    strip: false,
    match: within("/settings"),
    tabs: [
      {
        key: "org",
        label: "بيانات الجهة",
        to: "/settings/org",
        desc: "الهوية والترويسة والختم.",
        when: "عند تغيير بيانات الجهة.",
        match: within("/settings/org"),
      },
      {
        key: "team",
        label: "الفريق والصلاحيات",
        to: "/settings/team",
        perm: "team.view",
        desc: "المستخدمون والأدوار وما يراه كل دور.",
        when: "عند انضمام موظف أو تغيير مسؤولياته.",
        match: within("/settings/team"),
      },
      {
        key: "activity",
        label: "سجل النشاط",
        to: "/settings/activity",
        perm: "audit.view",
        desc: "من غيّر ماذا ومتى.",
        when: "عند مراجعة تعديل.",
        match: within("/settings/activity"),
      },
      {
        key: "import",
        label: "الاستيراد",
        to: "/settings/import",
        perm: "import.run",
        desc: "نقل البيانات من المنصة القديمة.",
        when: "عند نقل عميل.",
        match: within("/settings/import"),
      },
      {
        key: "appearance",
        label: "المظهر",
        to: "/settings/appearance",
        desc: "نمط الألوان: نهاري أو ليلي أو حسب الجهاز.",
        when: "عند تغيير راحة العين.",
        match: within("/settings/appearance"),
      },
    ],
  },
  {
    key: "soon",
    label: "قريباً",
    to: "/soon",
    icon: Clock,
    hint: "أدوات قادمة نعمل عليها",
    match: (p) => within("/soon")(p) || within("/more/soon")(p),
  },
];

/** The sections shown at the bottom of the sidebar, and not in the phone's bottom bar. */
export const LOWER_SECTIONS = ["settings", "soon"] as const;
export const PHONE_CORE = ["home", "sales", "projects", "finance"] as const;

export const sectionByKey = (key: string) => SECTIONS.find((s) => s.key === key);

/** A tab is visible when its permission is held (or it needs none). */
const can = (perms: readonly string[], perm?: string) => !perm || perms.includes(perm);
export const visibleTabs = (s: Section, perms: readonly string[]) =>
  (s.tabs ?? []).filter((t) => can(perms, t.perm));

/**
 * Sections the person may open. One with tabs shows when at least one tab is allowed, and its link
 * goes to the first allowed tab.
 */
export function visibleSections(perms: readonly string[]): Section[] {
  const out: Section[] = [];
  for (const s of SECTIONS) {
    if (!can(perms, s.perm)) continue;
    if (!s.tabs) {
      out.push(s);
      continue;
    }
    const tabs = visibleTabs(s, perms);
    const first = tabs[0];
    if (first) out.push({ ...s, to: first.to, tabs });
  }
  return out;
}

/** The URL of a tab, query included. */
export const tabHref = (t: Pick<SectionTab, "to" | "search">) =>
  t.search ? `${t.to}?${new URLSearchParams(t.search).toString()}` : t.to;

/** The section and tab a path is the list page of, or null (details, sections with their own navigation). */
export function tabOf(path: string): { section: Section; tab: SectionTab } | null {
  for (const section of SECTIONS) {
    if (section.strip === false) continue;
    for (const tab of section.tabs ?? []) if (tab.match(path)) return { section, tab };
  }
  return null;
}

/** Whether a path belongs to the phone's «المزيد» (a section that is not in the bottom bar). */
export const isMorePath = (path: string) =>
  path === "/more" ||
  SECTIONS.some((s) => !(PHONE_CORE as readonly string[]).includes(s.key) && s.match(path));

/* ── Tools on the way: explained, not built ───────────────────────────────── */
export type SoonTool = {
  key: string;
  label: string;
  to: string;
  icon: Icon;
  desc: string;
  when: string;
  will: string[];
};
const soonTo = (key: string) => `/more/soon/${key}`;

const RAW_SOON = [
  {
    key: "suppliers",
    label: "الموردون والمشتريات",
    to: soonTo("suppliers"),
    icon: Truck,
    desc: "دليل الموردين وأوامر الشراء وربطها بمصروفات المشاريع.",
    when: "عندما تتكرر المشتريات ويلزم مقارنة الأسعار.",
    will: [
      "ملف لكل مورد وتقييمه.",
      "أمر شراء يتحول إلى مصروف.",
      "مقارنة أسعار الموردين لنفس البند.",
    ],
  },
  {
    key: "hr",
    label: "الموارد البشرية",
    to: soonTo("hr"),
    icon: UserSquare,
    desc: "ملفات الموظفين والعقود والإجازات والعهد.",
    when: "عند توسّع الفريق.",
    will: ["ملف موظف بالعقد والوثائق.", "طلبات الإجازة واعتمادها.", "العُهد والتجهيزات."],
  },
  {
    key: "compliance",
    label: "الامتثال والوثائق",
    to: soonTo("compliance"),
    icon: CalendarCheck,
    desc: "تواريخ انتهاء السجل والشهادات والتراخيص مع تنبيه قبل الانتهاء.",
    when: "لتفادي انتهاء وثيقة دون انتباه.",
    will: ["سجل بكل وثيقة وتاريخ انتهائها.", "تنبيه قبل 60 و30 يوماً.", "إرفاق الملف الأصلي."],
  },
  {
    key: "meetings",
    label: "الاجتماعات والقرارات",
    to: soonTo("meetings"),
    icon: Briefcase,
    desc: "محاضر الاجتماعات وقراراتها ومتابعة تنفيذها.",
    when: "بعد كل اجتماع إداري أو مع شريك.",
    will: ["محضر بحضور وبنود.", "قرارات تتحول إلى مهام بمسؤول وموعد.", "أرشيف قابل للبحث."],
  },
  {
    key: "knowledge",
    label: "المعرفة والقوالب",
    to: soonTo("knowledge"),
    icon: BookOpen,
    desc: "دليل العمل والقوالب والعروض السابقة لتسريع التسليم.",
    when: "عند بدء مشروع يشبه مشروعاً سابقاً.",
    will: ["قوالب جاهزة لكل خدمة.", "أدلة إجرائية.", "دروس مستفادة من المشاريع."],
  },
  {
    key: "portal",
    label: "بوابة العميل والمانح",
    to: soonTo("portal"),
    icon: Users,
    desc: "صفحة يرى فيها العميل أو المانح تقدّم مشروعه ومستنداته ودفعاته.",
    when: "لتقليل المتابعات اليدوية وزيادة الثقة.",
    will: ["رابط آمن لكل عميل.", "تقدّم المشروع والمستندات المعتمدة.", "كشف حساب ودفعات."],
  },
  {
    key: "einvoice",
    label: "الفواتير الإلكترونية",
    to: soonTo("einvoice"),
    icon: Receipt,
    desc: "إصدار فواتير متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك.",
    when: "عند تطبيق مرحلة الربط الخاصة بالمنشأة.",
    will: ["فاتورة بتنسيق معتمد ورمز QR.", "ربط مع إقرار الضريبة.", "حفظ ومطابقة مع المقبوضات."],
  },
];
export const SOON_TOOLS: SoonTool[] = RAW_SOON;
export const soonToolOf = (key: string) => SOON_TOOLS.find((t) => t.key === key);
