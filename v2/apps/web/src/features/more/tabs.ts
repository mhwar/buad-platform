import {
  Banknote,
  BookOpen,
  Briefcase,
  CalendarCheck,
  Files,
  Globe,
  History,
  ListChecks,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Target,
  Truck,
  UserSquare,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type MoreTab = {
  key: string;
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** One sentence: what this tab is for. */
  desc: string;
  /** When to open it. */
  when: string;
  group: "work" | "company" | "admin" | "soon";
  /** Permission needed to see the tab (none = everyone). */
  perm?: string;
  /** Not built yet: opens an explanation page and carries a «قريباً» badge. */
  soon?: boolean;
  /** What it will contain, for «قريباً» tabs. */
  will?: string[];
  match: (path: string) => boolean;
};

const at = (to: string) => (p: string) => p === to || p.startsWith(`${to}/`);
const soon = (key: string) => `/more/soon/${key}`;

export const GROUPS: Record<MoreTab["group"], string> = {
  work: "إدارة العمل",
  company: "الشركة",
  admin: "الإدارة",
  soon: "قريباً",
};

/** Everything that is not one of the four basics, in the order the owner reads it. */
export const MORE_TABS: MoreTab[] = [
  {
    key: "plans",
    label: "الخطط",
    to: "/more/plans",
    icon: Target,
    group: "work",
    desc: "الخطة الاستراتيجية بأهدافها ومؤشراتها، والخطة التشغيلية السنوية بأرباعها ومبادراتها.",
    when: "عند وضع أهداف السنة أو مراجعة التقدّم كل ربع.",
    perm: "plans.view",
    match: at("/more/plans"),
  },
  {
    key: "tasks",
    label: "المهام",
    to: soon("tasks"),
    icon: ListChecks,
    group: "work",
    soon: true,
    desc: "مهام الفريق ومراحل تنفيذ كل مشروع ومن المسؤول عنها وموعدها.",
    when: "يومياً: لمعرفة ما عليك وما تأخّر.",
    will: [
      "مراحل المشروع تُولَّد من «آلية العمل» في الخدمة المرتبطة.",
      "إسناد المهام للفريق وتنبيههم، وحالات: قيد التنفيذ، معلّقة، منجزة.",
      "ساعات العمل لحساب تكلفة الوقت الحقيقية لكل مشروع.",
    ],
    match: at("/more/soon/tasks"),
  },
  {
    key: "sales",
    label: "المبيعات",
    to: soon("sales"),
    icon: ShoppingCart,
    group: "work",
    soon: true,
    perm: "sales.view",
    desc: "مسار العميل المحتمل من الطلب إلى العقد: متابعة، عرض سعر، تفاوض، مشروع.",
    when: "عند وصول طلب جديد أو متابعة العروض المرسلة.",
    will: [
      "لوحة مراحل: جديد، تواصل، عرض سعر، تفاوض، مكسوب، خسارة مع سبب الخسارة.",
      "عروض أسعار برقم متسلسل وملف PDF على ترويسة الجهة.",
      "تذكيرات المتابعة وقمع التحويل حسب الخدمة والمصدر.",
    ],
    match: at("/more/soon/sales"),
  },
  {
    key: "receivables",
    label: "التحصيل",
    to: soon("receivables"),
    icon: Banknote,
    group: "work",
    soon: true,
    perm: "treasury.view",
    desc: "الدفعات المستحقة والمتأخرة على العملاء، وتوقّع النقد للأسابيع القادمة.",
    when: "أسبوعياً: لمعرفة من يجب متابعته ومتى يتوفر النقد.",
    will: [
      "جدول دفعات لكل مشروع وتحويل الدفعة المستلمة إلى مقبوضة تلقائياً.",
      "أعمار الديون: غير مستحقة، 1–30، 31–60، 61–90، أكثر من 90 يوماً.",
      "توقّع نقدي لـ13 أسبوعاً من الدفعات المجدولة والمصروفات المعلّقة.",
    ],
    match: at("/more/soon/receivables"),
  },
  {
    key: "documents",
    label: "المستندات",
    to: "/documents",
    icon: Files,
    group: "company",
    perm: "documents.view",
    desc: "العقود والخطابات والصادر، من الإنشاء حتى الاعتماد والإرسال.",
    when: "عند إعداد عقد أو خطاب أو البحث عن مستند سابق.",
    match: at("/documents"),
  },
  {
    key: "products",
    label: "المنتجات والخدمات",
    to: "/products",
    icon: Package,
    group: "company",
    perm: "products.view",
    desc: "ما تقدّمه الشركة: الباقات والتسعير الداخلي وأداء كل خدمة وطلبات العروض.",
    when: "عند تعديل خدمة أو تسعيرها أو قراءة أدائها.",
    match: (p) => p === "/products",
  },
  {
    key: "website",
    label: "الموقع",
    to: "/website",
    icon: Globe,
    group: "company",
    perm: "site.view",
    desc: "الموقع التعريفي العام: المحتوى والمعاينة والنشر وسجل النسخ.",
    when: "عند تحديث الموقع أو نشر تغيير.",
    match: (p) => p === "/website",
  },
  {
    key: "team",
    label: "الفريق والصلاحيات",
    to: "/more/team",
    icon: ShieldCheck,
    group: "admin",
    perm: "team.view",
    desc: "من يدخل المنصة وبأي دور، وجدول ما يستطيع كل دور رؤيته وفعله.",
    when: "عند انضمام موظف أو تغيير مسؤولياته أو إيقاف حسابه.",
    match: at("/more/team"),
  },
  {
    key: "activity",
    label: "سجل النشاط",
    to: "/more/activity",
    icon: History,
    group: "admin",
    perm: "audit.view",
    desc: "من غيّر ماذا ومتى، لمراجعة أي تعديل مالي أو إداري.",
    when: "عند الاستفسار عن تعديل أو مراجعة نهاية الشهر.",
    match: at("/more/activity"),
  },
  {
    key: "settings",
    label: "الإعدادات والحساب",
    to: "/settings",
    icon: Settings,
    group: "admin",
    desc: "بيانات الجهة وهويتها، الاستيراد من المنصة القديمة، وحسابك الشخصي.",
    when: "عند تغيير بيانات الجهة أو كلمة المرور.",
    match: at("/settings"),
  },
  {
    key: "suppliers",
    label: "الموردون والمشتريات",
    to: soon("suppliers"),
    icon: Truck,
    group: "soon",
    soon: true,
    desc: "دليل الموردين وأوامر الشراء وربطها بمصروفات المشاريع.",
    when: "عندما تتكرر المشتريات ويلزم مقارنة الأسعار.",
    will: [
      "ملف لكل مورد وتقييمه.",
      "أمر شراء يتحول إلى مصروف.",
      "مقارنة أسعار الموردين لنفس البند.",
    ],
    match: at("/more/soon/suppliers"),
  },
  {
    key: "hr",
    label: "الموارد البشرية",
    to: soon("hr"),
    icon: UserSquare,
    group: "soon",
    soon: true,
    desc: "ملفات الموظفين والعقود والإجازات والعهد.",
    when: "عند توسّع الفريق.",
    will: ["ملف موظف بالعقد والوثائق.", "طلبات الإجازة واعتمادها.", "العُهد والتجهيزات."],
    match: at("/more/soon/hr"),
  },
  {
    key: "compliance",
    label: "الامتثال والوثائق",
    to: soon("compliance"),
    icon: CalendarCheck,
    group: "soon",
    soon: true,
    desc: "تواريخ انتهاء السجل والشهادات والتراخيص مع تنبيه قبل الانتهاء.",
    when: "لتفادي انتهاء وثيقة دون انتباه.",
    will: ["سجل بكل وثيقة وتاريخ انتهائها.", "تنبيه قبل 60 و30 يوماً.", "إرفاق الملف الأصلي."],
    match: at("/more/soon/compliance"),
  },
  {
    key: "meetings",
    label: "الاجتماعات والقرارات",
    to: soon("meetings"),
    icon: Briefcase,
    group: "soon",
    soon: true,
    desc: "محاضر الاجتماعات وقراراتها ومتابعة تنفيذها.",
    when: "بعد كل اجتماع إداري أو مع شريك.",
    will: ["محضر بحضور وبنود.", "قرارات تتحول إلى مهام بمسؤول وموعد.", "أرشيف قابل للبحث."],
    match: at("/more/soon/meetings"),
  },
  {
    key: "knowledge",
    label: "المعرفة والقوالب",
    to: soon("knowledge"),
    icon: BookOpen,
    group: "soon",
    soon: true,
    desc: "دليل العمل والقوالب والعروض السابقة لتسريع التسليم.",
    when: "عند بدء مشروع يشبه مشروعاً سابقاً.",
    will: ["قوالب جاهزة لكل خدمة.", "أدلة إجرائية.", "دروس مستفادة من المشاريع."],
    match: at("/more/soon/knowledge"),
  },
  {
    key: "portal",
    label: "بوابة العميل والمانح",
    to: soon("portal"),
    icon: Users,
    group: "soon",
    soon: true,
    desc: "صفحة يرى فيها العميل أو المانح تقدّم مشروعه ومستنداته ودفعاته.",
    when: "لتقليل المتابعات اليدوية وزيادة الثقة.",
    will: ["رابط آمن لكل عميل.", "تقدّم المشروع والمستندات المعتمدة.", "كشف حساب ودفعات."],
    match: at("/more/soon/portal"),
  },
  {
    key: "einvoice",
    label: "الفواتير الإلكترونية",
    to: soon("einvoice"),
    icon: Receipt,
    group: "soon",
    soon: true,
    desc: "إصدار فواتير متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك.",
    when: "عند تطبيق مرحلة الربط الخاصة بالمنشأة.",
    will: ["فاتورة بتنسيق معتمد ورمز QR.", "ربط مع إقرار الضريبة.", "حفظ ومطابقة مع المقبوضات."],
    match: at("/more/soon/einvoice"),
  },
];

export const visibleTabs = (perms: readonly string[]) =>
  MORE_TABS.filter((t) => !t.perm || perms.includes(t.perm));

/** The tab a path belongs to, or null when the page is not part of the hub. */
export const tabOf = (path: string) =>
  path === "/more" ? null : (MORE_TABS.find((t) => t.match(path)) ?? null);
export const inHub = (path: string) => path === "/more" || !!tabOf(path);
