import { describe, expect, it } from "vitest";
import { loginInput } from "./index";

describe("schemas", () => {
  it("validates login input", () => {
    expect(loginInput.safeParse({ email: "a@b.sa", password: "12345678" }).success).toBe(true);
    expect(loginInput.safeParse({ email: "nope", password: "12345678" }).success).toBe(false);
    expect(loginInput.safeParse({ email: "a@b.sa", password: "" }).success).toBe(false);
    // Legacy v1 passwords may be short; length rules apply only when setting a password.
    expect(loginInput.safeParse({ email: "a@b.sa", password: "abc123" }).success).toBe(true);
  });
});

describe("blueprints", () => {
  it("are valid, internally consistent and carry no invented prices", async () => {
    const { BLUEPRINTS } = await import("./blueprints");
    expect(BLUEPRINTS.map((b) => b.key)).toEqual([
      "patient-transport",
      "project-delivery",
      "operations-outsourcing",
      "tech-solutions",
      "logistics",
      "marketing-comms",
      "events-forums",
      "extended-programs",
      "supply-sponsorship",
      "erp-platform",
    ]);
    expect(new Set(BLUEPRINTS.map((b) => b.slug)).size).toBe(BLUEPRINTS.length);
    for (const b of BLUEPRINTS) {
      const pkgIds = b.content.packages.map((p) => p.id);
      expect(new Set(pkgIds).size).toBe(pkgIds.length);
      // every package has a pricing slot, every cost starts at 0, every quantity is empty
      expect(b.pricing.packages.map((p) => p.packageId).sort()).toEqual([...pkgIds].sort());
      expect(b.pricing.lines.every((l) => l.cost === 0)).toBe(true);
      expect(
        b.pricing.packages.every((p) => Object.keys(p.qty).length === 0 && p.fixedPrice === 0),
      ).toBe(true);
      expect(b.content.intake.length).toBeGreaterThan(0);
      // every select/multi question has options; keys are unique
      for (const q of b.content.intake)
        if (q.type === "select" || q.type === "multi") expect(q.options.length).toBeGreaterThan(1);
      const keys = b.content.intake.map((q) => q.key);
      expect(new Set(keys).size).toBe(keys.length);
      if (!b.content.comingSoon) expect(b.content.process.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("only the ERP platform is «coming soon», without a brochure or packages", async () => {
    const { BLUEPRINTS } = await import("./blueprints");
    const soon = BLUEPRINTS.filter((b) => b.content.comingSoon);
    expect(soon.map((b) => b.key)).toEqual(["erp-platform"]);
    expect(soon[0]?.content.brochure).toBe(false);
    expect(soon[0]?.content.packages).toEqual([]);
    // the easy interest form: tap-based questions about who they are, pain points and wishes
    const types = Object.fromEntries((soon[0]?.content.intake ?? []).map((q) => [q.key, q.type]));
    expect(types).toMatchObject({
      client_type: "select",
      org_kind: "select",
      pain: "multi",
      wish: "multi",
    });
  });

  it("reuses only the cases the org itself published (no invented proof)", async () => {
    const { BLUEPRINTS } = await import("./blueprints");
    const allowed = new Set(["مشروع رساء", "ملتقى الصيادلة", "أكاديمية ق", "الكفالة التعليمية"]);
    for (const b of BLUEPRINTS)
      for (const p of b.content.proof) expect(allowed.has(p.title)).toBe(true);
  });
});

describe("patch schemas never reset omitted fields", () => {
  it("productPatch keeps the tagline when it is not sent", async () => {
    const { productPatch } = await import("./products");
    expect(productPatch.parse({ version: 2, status: "published" })).toEqual({
      version: 2,
      status: "published",
    });
  });
  it("plan and task patches carry only what was sent", async () => {
    const { objectivePatch, initiativePatch, indicatorPatch } = await import("./plans");
    const { taskPatch, stagePatch } = await import("./tasks");
    expect(objectivePatch.parse({ title: "ع" })).toEqual({ title: "ع" });
    expect(initiativePatch.parse({ status: "done" })).toEqual({ status: "done" });
    expect(indicatorPatch.parse({ current: 5 })).toEqual({ current: 5 });
    expect(taskPatch.parse({ status: "done" })).toEqual({ status: "done" });
    expect(stagePatch.parse({ status: "doing" })).toEqual({ status: "doing" });
  });
});
