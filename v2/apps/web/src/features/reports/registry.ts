import {
  BarChart3,
  Briefcase,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  Gauge,
  History,
  Landmark,
  ListChecks,
  PieChart,
  Receipt,
  ShoppingCart,
  Stamp,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

export type ReportCategory = "finance" | "projects" | "sales" | "plans" | "clients" | "compliance";
export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  finance: "المالية",
  projects: "المشاريع والتنفيذ",
  sales: "المبيعات",
  plans: "التخطيط والأداء",
  clients: "العملاء",
  compliance: "الامتثال والسجلات",
};

/** The period chosen on the reports page. */
export type Period = { from: string; to: string; year: number; q: number; label: string };

export type ReportDef = {
  key: string;
  title: string;
  /** The question it answers, in one line. */
  question: string;
  category: ReportCategory;
  /** Any one of these permissions opens it. */
  perms: string[];
  icon: ComponentType<{ className?: string }>;
  /** Formats it offers. */
  formats: ("view" | "pdf" | "excel")[];
  /** It follows the period chosen here. */
  periodic?: boolean;
  /** Where it opens: a path with its query (built from the period when it follows one). */
  href: (p: Period | null) => string;
  /** Opened from a record (a project, a client): the list to pick it from. */
  perRecord?: string;
};

const qs = (o: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(o).filter(
      (e): e is [string, string | number] => e[1] !== undefined && e[1] !== "",
    ) as [string, string][],
  ).toString();
  return s ? `?${s}` : "";
};

/** Every report in the platform, in one register — the reports page lists what each role may open. */
export const REPORTS: ReportDef[] = [
  {
    key: "finance-report",
    title: "التقرير المالي للجهة",
    question: "ما وضعنا المالي في الفترة: الإيرادات والمصروفات والأرباح والالتزامات؟",
    category: "finance",
    perms: ["treasury.view"],
    icon: FileText,
    formats: ["view", "pdf", "excel"],
    periodic: true,
    href: (p) => `/finance/report${qs({ from: p?.from, to: p?.to })}`,
  },
  {
    key: "finance-dashboard",
    title: "لوحة المالية",
    question: "أي المشاريع تربح وأين يذهب الصرف، مقارنةً بالفترة السابقة؟",
    category: "finance",
    perms: ["treasury.view"],
    icon: BarChart3,
    formats: ["view", "excel"],
    periodic: true,
    href: (p) => `/finance${qs({ preset: p ? "custom" : undefined, from: p?.from, to: p?.to })}`,
  },
  {
    key: "receivables",
    title: "أعمار الديون وتوقّع النقد",
    question: "من تأخر في السداد، وكم سيدخل الحساب في الأسابيع القادمة؟",
    category: "finance",
    perms: ["treasury.view"],
    icon: Wallet,
    formats: ["view"],
    href: () => "/finance?tab=receivables",
  },
  {
    key: "quarter",
    title: "أرباح الربع والتوزيع",
    question: "كم تحقق من الأرباح في الربع وكم يمكن توزيعه؟",
    category: "finance",
    perms: ["treasury.view"],
    icon: PieChart,
    formats: ["view"],
    href: () => "/finance?tab=quarter",
  },
  {
    key: "company",
    title: "مالية الشركة",
    question: "دخل الخدمات ومصروفات الشركة وصافي الربح.",
    category: "finance",
    perms: ["treasury.view"],
    icon: Landmark,
    formats: ["view"],
    href: () => "/finance?tab=company",
  },
  {
    key: "vat",
    title: "إقرار ضريبة القيمة المضافة",
    question: "ما الذي نصرّح به للهيئة عن الربع: المبيعات والمشتريات والضريبة؟",
    category: "compliance",
    perms: ["vat.view"],
    icon: Receipt,
    formats: ["view", "pdf", "excel"],
    periodic: true,
    href: (p) => `/finance/vat/report${qs({ year: p?.year, q: p?.q })}`,
  },
  {
    key: "portfolio",
    title: "محفظة المشاريع",
    question: "كل مشروع: تقدّمه وموعده وما حُصّل منه وما يستحق.",
    category: "projects",
    perms: ["projects.view"],
    icon: Briefcase,
    formats: ["view", "pdf", "excel"],
    href: () => "/reports/portfolio",
  },
  {
    key: "execution",
    title: "التنفيذ والإنتاجية",
    question: "ما المنجز والمتأخر لكل شخص ومشروع، وكم ساعة سُجّلت؟",
    category: "projects",
    perms: ["tasks.view"],
    icon: ListChecks,
    formats: ["view", "pdf", "excel"],
    periodic: true,
    href: (p) => `/reports/execution${qs({ from: p?.from, to: p?.to })}`,
  },
  {
    key: "project-finance",
    title: "التقرير المالي للمشروع",
    question: "كشف معاملات المشروع للعميل، أو تقريره التفصيلي بالأرباح.",
    category: "projects",
    perms: ["finance.view"],
    icon: FileSpreadsheet,
    formats: ["pdf", "excel"],
    href: () => "/projects",
    perRecord: "من قائمة «⋯» في صفحة المشروع",
  },
  {
    key: "sales",
    title: "تحليلات المبيعات",
    question: "القمع ونسبة الكسب والمصادر والمكسوب شهرياً، للفترة المختارة.",
    category: "sales",
    perms: ["sales.view"],
    icon: ShoppingCart,
    formats: ["view"],
    periodic: true,
    href: (p) => `/sales/analytics${qs({ from: p?.from, to: p?.to })}`,
  },
  {
    key: "quotes",
    title: "عروض الأسعار",
    question: "ما أُرسل وما قُبل ورُفض، وما ينتهي قريباً.",
    category: "sales",
    perms: ["sales.view"],
    icon: FileText,
    formats: ["view"],
    href: () => "/sales/quotes",
  },
  {
    key: "statement",
    title: "كشف حساب العميل",
    question: "مشاريع العميل وعقوده وما دفعه وما تبقى عليه.",
    category: "clients",
    perms: ["clients.view"],
    icon: Users,
    formats: ["view", "pdf", "excel"],
    href: () => "/clients",
    perRecord: "من صفحة كل عميل: «كشف حساب»",
  },
  {
    key: "plans",
    title: "متابعة الخطة",
    question: "أين نقف من المستهدفات: الإيرادات والمؤشرات والمبادرات.",
    category: "plans",
    perms: ["plans.view"],
    icon: Target,
    formats: ["view"],
    href: () => "/plans",
  },
  {
    key: "products",
    title: "أداء المنتجات والخدمات",
    question: "أي خدمة تبيع أكثر وتربح أكثر، والفعلي مقابل المخطط.",
    category: "plans",
    perms: ["products.view"],
    icon: Gauge,
    formats: ["view"],
    href: () => "/products?tab=overview",
  },
  {
    key: "outgoing",
    title: "سجل الصادر",
    question: "كل مستند صدر برقم، ومتى.",
    category: "compliance",
    perms: ["documents.view"],
    icon: Stamp,
    formats: ["view"],
    href: () => "/documents?view=outgoing",
  },
  {
    key: "audit",
    title: "سجل النشاط",
    question: "من فعل ماذا ومتى.",
    category: "compliance",
    perms: ["audit.view"],
    icon: History,
    formats: ["view"],
    href: () => "/settings/activity",
  },
  {
    key: "meetings",
    title: "الاجتماعات والقرارات",
    question: "ما تقرّر، ومن المسؤول، وما تأخر تنفيذه.",
    category: "plans",
    perms: ["meetings.view"],
    icon: CalendarRange,
    formats: ["view"],
    href: () => "/decisions",
  },
];

export const visibleReports = (perms: readonly string[]) =>
  REPORTS.filter((r) => r.perms.some((p) => perms.includes(p)));
