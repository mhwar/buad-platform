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

export type RequestStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  quoted: "عُرض عليه سعر",
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
  createdAt: number;
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
