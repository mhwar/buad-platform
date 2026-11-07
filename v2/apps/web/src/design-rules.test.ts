import { describe, expect, it } from "vitest";

/**
 * docs/DESIGN.md, enforced: pages take status colours from the tokens (success / warning /
 * danger), never from raw palette shades or hex values, and no text is set below 12px.
 * Print pages and the public website have their own look and are left out.
 */
const files = import.meta.glob(["./**/*.tsx", "!./**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const EXEMPT = [
  /\/features\/site\//, // public website
  /\/features\/website\//, // its editor previews the public look
  /Print/, // printed quotes and documents
  /\/features\/documents\/(DocumentView|Pages|letterhead)/,
  /Brochure/,
  /\/brand\.tsx$/, // the logo keeps its navy
];
const RAW =
  /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|fill|stroke)-(?:red|amber|emerald|green|blue|yellow|orange|rose|lime|teal|sky|indigo|violet|purple|pink)-\d{2,3}\b/g;
const HEX = /(?<![&\w])#[0-9a-fA-F]{6}\b/g;
const TINY = /text-\[(?:[0-9]|1[01])px\]/g;

const scanned = Object.entries(files).filter(([path]) => !EXEMPT.some((r) => r.test(path)));

describe("design rules", () => {
  it("scans the app's pages", () => {
    expect(scanned.length).toBeGreaterThan(100);
  });

  it("status colours come from tokens, not raw palette shades or hex", () => {
    const found = scanned.flatMap(([path, src]) =>
      [...(src.match(RAW) ?? []), ...(src.match(HEX) ?? [])].map((m) => `${path}: ${m}`),
    );
    expect(found).toEqual([]);
  });

  it("no text below 12px", () => {
    const found = scanned.flatMap(([path, src]) =>
      (src.match(TINY) ?? []).map((m) => `${path}: ${m}`),
    );
    expect(found).toEqual([]);
  });
});
