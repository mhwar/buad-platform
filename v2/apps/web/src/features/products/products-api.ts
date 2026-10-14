import type { PricingModel, ProductContent } from "@buad/schema/products";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type ProductStatus = "draft" | "published" | "archived";
export type ReadinessItem = { key: string; label: string; ok: boolean; hint: string };

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  status: ProductStatus;
  showOnSite: boolean;
  version: number;
  updatedAt: number;
  packages: number;
  readyCount: number;
  readyTotal: number;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  status: ProductStatus;
  showOnSite: boolean;
  version: number;
  updatedAt: number;
  content: ProductContent;
  pricing: PricingModel;
  vatRate: number;
  readiness: ReadinessItem[];
};
export type BlueprintItem = {
  key: string;
  name: string;
  tagline: string;
  productId: string | null;
};

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "مسودة",
  published: "منشور",
  archived: "مؤرشف",
};
export const UNIT_LABEL: Record<string, string> = {
  trip: "رحلة",
  night: "ليلة",
  person: "مستفيد",
  month: "شهر",
  project: "مشروع",
  fixed: "بند ثابت",
};
export const METHOD_LABEL: Record<string, string> = {
  margin: "هامش ربح من السعر",
  markup: "نسبة إضافة على التكلفة",
  fixed: "سعر ثابت لكل باقة",
};

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () =>
    (await ok<{ products: ProductListItem[] }>(await fetch("/api/products"))).products,
});
export const blueprintsQuery = queryOptions({
  queryKey: ["product-blueprints"],
  queryFn: async () =>
    (await ok<{ blueprints: BlueprintItem[] }>(await fetch("/api/products/blueprints"))).blueprints,
});
export const productQuery = (id: string) =>
  queryOptions({
    queryKey: ["product", id],
    queryFn: async () =>
      (await ok<{ product: Product }>(await fetch(`/api/products/${id}`))).product,
  });

export const sendJson = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export type RequestStatus = "new" | "contacted" | "quoted" | "negotiating" | "won" | "lost";
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  quoted: "عُرض عليه سعر",
  negotiating: "تفاوض",
  won: "تم التعاقد",
  lost: "لم يكتمل",
};
export type ProductRequest = {
  id: string;
  productId: string;
  productName: string;
  source: "site" | "manual";
  status: RequestStatus;
  name: string;
  entity: string;
  phone: string;
  email: string;
  message: string;
  answers: Record<string, string>;
  quote: Record<string, unknown>;
  notes: string;
  clientId: string;
  projectId: string;
  ownerId: string;
  followUpAt: string;
  value: number;
  lostReason: string;
  updatedAt: number;
  createdAt: number;
  /** Registered for a «coming soon» product (not a quote request). */
  interest: boolean;
};
export type RequestsData = {
  requests: ProductRequest[];
  counts: Partial<Record<RequestStatus, number>>;
};
export const requestsQuery = (status: RequestStatus | "") =>
  queryOptions({
    queryKey: ["product-requests", status],
    queryFn: async () =>
      ok<RequestsData>(await fetch(`/api/product-requests${status ? `?status=${status}` : ""}`)),
  });

/* ── Performance (how a service has actually done) ───────────────────────── */
export type Insight =
  | { code: "no_projects" }
  | { code: "top_package"; name: string; share: number }
  | { code: "margin_below_plan"; gap: number }
  | { code: "margin_above_plan"; gap: number }
  | { code: "repeat_entities"; count: number }
  | { code: "no_package"; count: number }
  | { code: "losing_projects"; count: number }
  | { code: "stale_requests"; count: number }
  | { code: "low_conversion"; pct: number };
export type ProductStats = {
  totals: {
    projects: number;
    active: number;
    completed: number;
    entities: number;
    repeatEntities: number;
    contractNet: number;
    gross: number;
    received: number;
    expenses: number;
    profit: number;
    realizedProfit: number;
    marginPct: number;
    avgContract: number;
  };
  plannedMarginPct: number | null;
  marginGap: number | null;
  packages: {
    packageId: string;
    name: string;
    projects: number;
    contractNet: number;
    profit: number;
    marginPct: number;
    share: number;
  }[];
  entities: { clientId: string; name: string; projects: number; contractNet: number }[];
  trend: { key: string; projects: number; contractNet: number }[];
  funnel: {
    total: number;
    new: number;
    contacted: number;
    quoted: number;
    won: number;
    lost: number;
    conversionPct: number;
  };
  insights: Insight[];
};
export type StatProjectRow = {
  id: string;
  number: string;
  name: string;
  clientId: string;
  clientName: string;
  status: string;
  packageId: string;
  packageName: string;
  startDate: string;
  hasFinance: boolean;
  contractNet: number;
  gross: number;
  received: number;
  expenses: number;
  profit: number;
};
export const statsQuery = (id: string) =>
  queryOptions({
    queryKey: ["product-stats", id],
    queryFn: async () =>
      ok<{
        product: { id: string; name: string; slug: string };
        stats: ProductStats;
        projects: StatProjectRow[];
      }>(await fetch(`/api/products/${id}/stats`)),
  });

export type OverviewRow = {
  id: string;
  name: string;
  status: ProductStatus;
  projects: number;
  entities: number;
  repeatEntities: number;
  contractNet: number;
  profit: number;
  marginPct: number;
  plannedMarginPct: number | null;
  marginGap: number | null;
  requests: number;
  won: number;
  conversionPct: number;
};
export const overviewQuery = queryOptions({
  queryKey: ["product-overview"],
  queryFn: async () =>
    ok<{ products: OverviewRow[]; unlinkedProjects: number }>(
      await fetch("/api/products/overview"),
    ),
});

export type UnlinkedProject = {
  id: string;
  number: string;
  name: string;
  clientName: string;
  status: string;
  contractNet: number;
};
export const unlinkedQuery = queryOptions({
  queryKey: ["product-unlinked"],
  queryFn: async () =>
    (await ok<{ projects: UnlinkedProject[] }>(await fetch("/api/products/unlinked-projects")))
      .projects,
});

/** The sentence for an insight (the domain returns only the rule and its numbers). */
export const insightText = (i: Insight): { tone: "good" | "warn" | "info"; text: string } => {
  switch (i.code) {
    case "no_projects":
      return {
        tone: "info",
        text: "لا مشاريع مرتبطة بهذه الخدمة بعد. اربط المشاريع المنفذة أو اختر الخدمة عند إنشاء مشروع.",
      };
    case "top_package":
      return {
        tone: "info",
        text: `باقة «${i.name}» تمثل ${i.share}% من مشاريع هذه الخدمة: هي الباقة التي يطلبها عملاؤكم.`,
      };
    case "margin_below_plan":
      return {
        tone: "warn",
        text: `الهامش الفعلي أقل من المخطط بـ ${i.gap} نقطة: راجعوا تكاليف الخدمة أو سعرها.`,
      };
    case "margin_above_plan":
      return { tone: "good", text: `الهامش الفعلي أعلى من المخطط بـ ${i.gap} نقطة.` };
    case "repeat_entities":
      return {
        tone: "good",
        text: `${i.count} جهة كررت الخدمة: مؤشر رضا يستحق عرض عقد ممتد عليها.`,
      };
    case "no_package":
      return { tone: "warn", text: `${i.count} مشروع بلا باقة محددة: حدّدوها ليكتمل التحليل.` };
    case "losing_projects":
      return { tone: "warn", text: `${i.count} مشروع بربح سالب في هذه الخدمة.` };
    case "stale_requests":
      return { tone: "warn", text: `${i.count} طلب جديد لم يُتابَع منذ أكثر من 3 أيام.` };
    case "low_conversion":
      return {
        tone: "warn",
        text: `نسبة تحويل الطلبات إلى تعاقد ${i.pct}% فقط: راجعوا العرض أو سرعة المتابعة.`,
      };
  }
};
