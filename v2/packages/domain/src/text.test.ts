import { describe, expect, it } from "vitest";
import { formatCode, normalizeName } from "./text";

describe("normalizeName", () => {
  it("folds Arabic variants, diacritics, tatweel, case and spacing", () => {
    expect(normalizeName("مؤسسة  الأمَل")).toBe(normalizeName("مؤسسه الامل"));
    expect(normalizeName("جمعيـــة إحسان")).toBe(normalizeName("جمعية احسان"));
    expect(normalizeName("مستشفى")).toBe(normalizeName("مستشفي"));
    expect(normalizeName("  ACME, Ltd. ")).toBe("acme ltd");
  });
  it("keeps genuinely different names apart", () => {
    expect(normalizeName("جمعية الأمل")).not.toBe(normalizeName("جمعية النور"));
  });
});

describe("formatCode", () => {
  it("pads and optionally includes the year", () => {
    expect(formatCode("CL", 7)).toBe("CL-0007");
    expect(formatCode("PRJ", 12, 2026)).toBe("PRJ-2026-0012");
    expect(formatCode("CL", 12345)).toBe("CL-12345");
  });
});
