import { describe, expect, it } from "vitest";
import { financeParity, planFinance } from "./finance-plan";

// Deterministic PRNG so a failure is reproducible.
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T;
/** Money as v1 users type it: up to 2 decimals, sometimes a string, sometimes missing. */
const money = (r: () => number) =>
  pick(r, [0, "", undefined, Math.round(r() * 1e7) / 100, String(Math.round(r() * 5e6) / 100)]);

function randomV1Fin(r: () => number) {
  const types = ["pct", "fixed", undefined];
  const bases = ["net", "gross", undefined];
  const budget = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
    name: `بند ${i}`,
    amount: money(r),
    note: "",
  }));
  return {
    ctrl: {
      contract_value: money(r),
      vat_pct: pick(r, [15, "15", 0, 5, undefined]),
      vat_included: r() < 0.5,
      mkt_internal: r() < 0.3,
      exec_v: pick(r, [10, "7.5", 0, undefined, 2500]),
      exec_type: pick(r, types),
      exec_base: pick(r, bases),
      mkt_v: pick(r, [0, 5, "3", undefined]),
      mkt_type: pick(r, types),
      mkt_base: pick(r, bases),
      cb_v: pick(r, [0, 2, undefined]),
      cb_type: pick(r, types),
      cb_base: pick(r, bases),
      cf_v: pick(r, [0, 15, undefined]),
      cf_type: pick(r, types),
      cf_base: pick(r, bases),
      op_cats: pick(r, [undefined, [], ["salary", "cc_x"]]),
      custom_cats: [{ id: "cc_x", label: "سفر", type: "expense" }],
    },
    budget,
    entries: Array.from({ length: Math.floor(r() * 7) }, (_, i) => ({
      id: `e${i}`,
      date: "2026-01-02",
      desc: "قيد",
      type: r() < 0.7 ? "expense" : "income",
      cat: pick(r, [
        "exec",
        "mkt",
        "cashback",
        "cf",
        "salary",
        "logistics",
        "materials",
        "other",
        "cc_x",
        "bdg_0",
      ]),
      amount: money(r),
      profit_margin: pick(r, [0, "", 10, "13.043", 250]),
      profit_margin_type: pick(r, ["pct", "fixed", undefined]),
      status: pick(r, ["", "paid", "weird"]),
      note: pick(r, ["", "من الاتفاقية", "ملاحظة"]),
    })),
  };
}

describe("planFinance", () => {
  it("maps v1 fields with FinCalc's own fallbacks", () => {
    const rows = planFinance("p1", {
      ctrl: { contract_value: "1000", exec_v: 10 },
      entries: [],
      budget: [],
    });
    expect(rows.ctrl).toMatchObject({
      contractValue: 100000,
      vatPct: 0,
      execType: "pct",
      execBase: "net",
      mktBase: "net",
    });
  });

  it("turns positional budget categories and agreement notes into v2 references", () => {
    const rows = planFinance("p1", {
      budget: [{ name: "قاعة", amount: 300 }],
      entries: [
        {
          id: "e1",
          cat: "bdg_0",
          desc: "قاعة",
          type: "expense",
          amount: 300,
          note: "من الاتفاقية",
        },
      ],
    });
    expect(rows.entries[0]).toMatchObject({ cat: "bdg_bud_p1_0", source: "agreement", note: "" });
    expect(rows.budget[0]).toMatchObject({ id: "bud_p1_0", name: "قاعة", amount: 30000 });
  });

  it("keeps v1 entry ids (namespaced by project) and gives missing descriptions a placeholder", () => {
    const rows = planFinance("p1", {
      entries: [
        { id: "abc", type: "income", amount: 5 },
        { type: "expense", amount: 1 },
      ],
    });
    expect(rows.entries.map((e) => e.id)).toEqual(["v1_p1_abc", "v1_p1_1"]);
    expect(rows.entries[0]?.description).toBe("(بدون وصف)");
  });
});

describe("financeParity: v2 numbers equal v1 numbers", () => {
  it("is exact on 1000 random v1 projects with 2-decimal money", () => {
    const r = rng(424242);
    for (let i = 0; i < 1000; i++) {
      const raw = randomV1Fin(r);
      const p = financeParity("p", raw, planFinance("p", raw));
      expect(p, `case ${i}: ${JSON.stringify(raw)}`).toMatchObject({ status: "exact", diffs: [] });
    }
  });

  it("reports sub-halala amounts as rounding, never as a match or mismatch", () => {
    const raw = {
      ctrl: { contract_value: 100, vat_pct: 15, exec_v: 0 },
      entries: [{ type: "expense", cat: "other", amount: 10.004 }],
    };
    expect(financeParity("p", raw, planFinance("p", raw)).status).toBe("rounding");
  });

  it("flags a real difference", () => {
    const raw = { ctrl: { contract_value: 100 } };
    const rows = planFinance("p", raw);
    rows.ctrl.contractValue = 20000;
    const p = financeParity("p", raw, rows);
    expect(p.status).toBe("mismatch");
    expect(p.diffs.map((d) => d.field)).toContain("grossTotal");
  });
});
