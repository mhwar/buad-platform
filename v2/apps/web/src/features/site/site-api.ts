import type { IntakeQuestion, ProductContent } from "@buad/schema/products";
import type { SiteContent } from "@buad/schema/site";
import { queryOptions } from "@tanstack/react-query";
import { ok } from "../../lib/format";

export type SiteProductCard = {
  slug: string;
  name: string;
  tagline: string;
  hero: ProductContent["hero"];
  /** Its cover photo ("" when none). */
  imageUrl: string;
  icon?: string;
  /** Up to three reasons to choose it. */
  points: string[];
  packages: number;
  intake: IntakeQuestion[];
  comingSoon: boolean;
};
export type SiteHome =
  | { published: false }
  | {
      published: true;
      site: SiteContent;
      logoUrl: string;
      /** Where uploaded images are served from (the private store while previewing a draft). */
      assetBase: string;
      products: SiteProductCard[];
    };

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
  imageUrl: string;
  product: { slug: string; name: string; tagline: string; content: ProductContent };
};
export const siteProductQuery = (slug: string) =>
  queryOptions({
    queryKey: ["site-product", slug],
    queryFn: async () => ok<SiteProduct>(await fetch(`/api/public/site/products/${slug}`)),
    retry: false,
    staleTime: 30_000,
  });

export type RequestTarget = {
  slug: string;
  name: string;
  intake: IntakeQuestion[];
  comingSoon?: boolean;
  /** The package picked on the product page (sent with the message). */
  packageName?: string;
} | null;

/** The request form's wording for a coming-soon product: registering interest, not asking for a quote. */
export const interestForm = (form: SiteContent["form"]): SiteContent["form"] => ({
  ...form,
  title: "سجّل اهتمامك",
  intro: "أجب بضغطات سريعة، ونخبرك أولاً عند الإطلاق ونبني معك ما تحتاجه.",
  submitLabel: "سجّل اهتمامي",
  successMessage: "سجّلنا اهتمامك. سنتواصل معك أولاً عند الإطلاق.",
});

export const waLink = (digits: string, text = "") =>
  `https://wa.me/${digits.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
