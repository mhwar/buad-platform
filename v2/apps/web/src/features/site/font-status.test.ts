import { describe, expect, it } from "vitest";
import { checkFonts, fontLine } from "./font-status";

const set = (loaded: string[]) => ({
  load: async (spec: string) => (loaded.some((f) => spec.includes(f)) ? [{} as FontFace] : []),
});

describe("checkFonts", () => {
  it("reports each family as loaded only when its face was fetched", async () => {
    expect(await checkFonts(set(["Serif Display", "Thmanyah Sans"]))).toEqual({
      serif: true,
      sans: true,
    });
    expect(await checkFonts(set(["Thmanyah Sans"]))).toEqual({ serif: false, sans: true });
    expect(await checkFonts(set([]))).toEqual({ serif: false, sans: false });
  });

  it("treats a failing load as not loaded", async () => {
    const failing = {
      load: async () => {
        throw new Error("network");
      },
    };
    expect(await checkFonts(failing)).toEqual({ serif: false, sans: false });
  });

  it("words the status for the page", () => {
    expect(fontLine(null)).toContain("جارٍ");
    expect(fontLine({ serif: true, sans: true })).toContain("✓");
    expect(fontLine({ serif: false, sans: true })).toContain("لم يتحمل");
  });
});
