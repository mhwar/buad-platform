import { DEFAULT_SITE } from "@buad/schema/site";
import { describe, expect, it } from "vitest";
import { type HealthContext, healthScore, siteHealth } from "./health";

const ctx: HealthContext = {
  listedSlugs: ["patient-transport"],
  isPublished: true,
  changedSections: [],
  staleRequests: 0,
};
const by = (c = DEFAULT_SITE, x = ctx) =>
  Object.fromEntries(siteHealth(c, x).map((i) => [i.key, i]));

describe("siteHealth", () => {
  it("passes what the default site already has, and flags what it lacks", () => {
    const h = by();
    expect(h.whatsapp?.ok).toBe(true);
    expect(h.email?.ok).toBe(true);
    expect(h.faq?.ok).toBe(true);
    expect(h.products?.ok).toBe(true);
    // the default has no logos yet, and one card points at a product that is not listed
    expect(h.logos?.ok).toBe(false);
    expect(h.links?.ok).toBe(false);
    expect(h.links?.hint).toContain("إدارة وتنفيذ المشاريع");
  });

  it("whatsapp must be an international number", () => {
    const bad = { ...DEFAULT_SITE, contact: { ...DEFAULT_SITE.contact, whatsapp: "0551234567" } };
    expect(by(bad).whatsapp?.ok).toBe(false);
  });

  it("unpublished or changed sites, stale requests and no listed product are flagged", () => {
    expect(by(DEFAULT_SITE, { ...ctx, isPublished: false }).published?.ok).toBe(false);
    expect(by(DEFAULT_SITE, { ...ctx, changedSections: ["hero"] }).published?.ok).toBe(false);
    expect(by(DEFAULT_SITE, { ...ctx, staleRequests: 2 }).requests?.ok).toBe(false);
    expect(by(DEFAULT_SITE, { ...ctx, listedSlugs: [] }).products?.ok).toBe(false);
  });

  it("logos pass when half the entities have one; the score is the share of passed items", () => {
    const items = DEFAULT_SITE.trust.items.map((i, k) =>
      k < 3 ? { ...i, logoAsset: "ast_x" } : i,
    );
    expect(by({ ...DEFAULT_SITE, trust: { ...DEFAULT_SITE.trust, items } }).logos?.ok).toBe(true);
    const list = siteHealth(DEFAULT_SITE, ctx);
    expect(healthScore(list)).toBe(
      Math.round((list.filter((i) => i.ok).length / list.length) * 100),
    );
  });

  it("flags fonts that did not load, but not while checking", () => {
    expect(by(DEFAULT_SITE, { ...ctx, fonts: null }).fonts?.ok).toBe(true);
    expect(by(DEFAULT_SITE, { ...ctx, fonts: { serif: true, sans: true } }).fonts?.ok).toBe(true);
    expect(by(DEFAULT_SITE, { ...ctx, fonts: { serif: false, sans: true } }).fonts?.ok).toBe(false);
  });

  it("search snippet lengths", () => {
    const c = { ...DEFAULT_SITE, seo: { title: "قصير", description: "قصير" } };
    expect(by(c)["seo-title"]?.ok).toBe(false);
    expect(by(c)["seo-desc"]?.ok).toBe(false);
    expect(by()["seo-title"]?.ok).toBe(true);
  });
});
