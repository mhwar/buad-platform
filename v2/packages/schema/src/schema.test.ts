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
    expect(BLUEPRINTS.map((b) => b.key)).toEqual(["patient-transport", "project-delivery"]);
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
      expect(b.content.process.length).toBeGreaterThanOrEqual(3);
    }
  });
});
