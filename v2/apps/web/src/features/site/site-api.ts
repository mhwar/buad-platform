import type { IntakeQuestion, ProductContent } from "@buad/schema/products";
import type { SiteContent } from "@buad/schema/site";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type SiteProductCard = {
  slug: string;
  name: string;
  tagline: string;
  hero: ProductContent["hero"];
  packages: number;
  intake: IntakeQuestion[];
};
export type SiteHome =
  | { published: false }
  | { published: true; site: SiteContent; logoUrl: string; products: SiteProductCard[] };

/** `preview`: the draft, for signed-in managers (before publishing). */
export const siteHomeQuery = (preview: boolean) =>
  queryOptions({
    queryKey: ["site-home", preview],
    queryFn: async () =>
      ok<SiteHome>(await fetch(preview ? "/api/site/preview" : "/api/public/site")),
    retry: false,
    staleTime: 30_000,
  });

export type SiteProduct = {
  site: Pick<SiteContent, "brand" | "contact" | "seo" | "cta" | "form">;
  logoUrl: string;
  product: { slug: string; name: string; tagline: string; content: ProductContent };
};
export const siteProductQuery = (slug: string) =>
  queryOptions({
    queryKey: ["site-product", slug],
    queryFn: async () => ok<SiteProduct>(await fetch(`/api/public/site/products/${slug}`)),
    retry: false,
    staleTime: 30_000,
  });

export type RequestTarget = { slug: string; name: string; intake: IntakeQuestion[] } | null;

export const waLink = (digits: string, text = "") =>
  `https://wa.me/${digits.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
