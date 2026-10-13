import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type FinInput, finCalc } from "./fincalc";

/** Load the real v1 FinCalc out of app.html so the port is checked against the source of truth. */
function loadV1(): (fin: FinInput) => unknown {
  const html = readFileSync(resolve(__dirname, "../../../../app.html"), "utf8");
  const start = html.indexOf("var FinCalc = {");
  const end = html.indexOf("/* ═══", start);
  if (start < 0 || end < 0) throw new Error("FinCalc not found in app.html");
  const src = html.slice(start, end);
  let current: FinInput = {};
  const DB = { getFin: () => current };
  const FinCalc = new Function("DB", `${src}; return FinCalc;`)(DB);
  return (fin) => {
    current = fin;
    return FinCalc.calc("x");
  };
}

// Small deterministic PRNG so failures are reproducible.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T;
const amount = (r: () => number) =>
  pick(r, [
    0,
    "",
    undefined,
    null,
    "abc",
    Math.round(r() * 1e6) / 100,
    String(Math.round(r() * 5e5) / 100),
  ]);

function randomInput(r: () => number): FinInput {
  const types = ["pct", "fixed", undefined] as const;
  const bases = ["net", "gross", undefined] as const;
  const cats = [
    "exec",
    "vat",
    "mkt",
    "cashback",
    "cf",
    "salary",
    "logistics",
    "materials",
    "other",
    "custom",
  ];
  return {
    ctrl: {
      contract_value: amount(r),
      vat_pct: pick(r, [0, 15, "15", 5, undefined]),
      vat_included: r() < 0.5,
      mkt_internal: r() < 0.5,
      exec_v: amount(r),
      exec_type: pick(r, [...types]),
      exec_base: pick(r, [...bases]),
      mkt_v: amount(r),
      mkt_type: pick(r, [...types]),
      mkt_base: pick(r, [...bases]),
      cb_v: amount(r),
      cb_type: pick(r, [...types]),
      cb_base: pick(r, [...bases]),
      cf_v: amount(r),
      cf_type: pick(r, [...types]),
      cf_base: pick(r, [...bases]),
      op_cats: pick(r, [undefined, [], ["salary", "custom"]]),
    },
    budget: Array.from({ length: Math.floor(r() * 4) }, () => ({ amount: amount(r) })),
    entries: Array.from({ length: Math.floor(r() * 8) }, () => ({
      type: r() < 0.7 ? ("expense" as const) : ("income" as const),
      cat: pick(r, cats),
      amount: amount(r),
      profit_margin: pick(r, [0, "", 5, "7.5", undefined]),
      profit_margin_type: pick(r, ["pct", "fixed", undefined]),
    })),
  };
}

describe("finCalc parity with v1", () => {
  const v1 = loadV1();

  it("matches v1 on empty input", () => {
    expect(finCalc({})).toEqual(v1({}));
  });

  it("matches v1 on 3000 random inputs, every field", () => {
    const r = rng(20260101);
    for (let i = 0; i < 3000; i++) {
      const input = randomInput(r);
      const expected = v1(JSON.parse(JSON.stringify(input)));
      const actual = finCalc(JSON.parse(JSON.stringify(input)));
      expect(actual, `case ${i}: ${JSON.stringify(input)}`).toEqual(expected);
    }
  });
});
