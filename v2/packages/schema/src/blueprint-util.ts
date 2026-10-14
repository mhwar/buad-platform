import { type PricingModel, type ProductContent, pricingModel, productContent } from "./products";

export type Blueprint = {
  key: string;
  slug: string;
  name: string;
  tagline: string;
  content: ProductContent;
  pricing: PricingModel;
};

/** Validates a blueprint and fills the defaults (so every stored product has the full shape). */
export const defineBlueprint = (b: {
  key: string;
  slug: string;
  name: string;
  tagline: string;
  content: unknown;
  pricing: unknown;
}): Blueprint => ({
  ...b,
  content: productContent.parse(b.content),
  pricing: pricingModel.parse(b.pricing),
});
