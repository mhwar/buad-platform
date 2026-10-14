import { describe, expect, it } from "vitest";
import { packageQuote, priceQuote, productReadiness } from "./pricing";

const lines = [
  { id: "trip", label: "رحلة", unit: "trip", cost: 100 },
  { id: "night", label: "ليلة", unit: "night", cost: 250 },
];

describe("priceQuote", () => {
  it("cost-plus margin: price = cost / (1 - margin)", () => {
    // 10 trips + 4 nights = 1000 + 1000 = 2000 cost; 20% margin → 2500 price
    const q = priceQuote({ method: "margin", value: 20, lines }, { trip: 10, night: 4 }, 0, 15);
    expect(q.status).toBe("ok");
    expect(q.cost).toBe(2000);
    expect(q.price).toBe(2500);
    expect(q.vat).toBe(375);
    expect(q.total).toBe(2875);
    expect(q.profit).toBe(500);
    expect(q.marginPct).toBe(20);
    expect(q.markupPct).toBe(25);
    // costs +10% = 2200 → (2500-2200)/2500 = 12%
    expect(q.marginIfCostUp10).toBe(12);
  });

  it("markup: price = cost × (1 + markup)", () => {
    const q = priceQuote({ method: "markup", value: 20, lines }, { trip: 10, night: 4 }, 0, 15);
    expect(q.price).toBe(2400);
    expect(q.marginPct).toBe(16.67);
  });

  it("fixed price: profit comes from the typed price", () => {
    const q = priceQuote({ method: "fixed", value: 0, lines }, { trip: 10 }, 1500, 0);
    expect(q.price).toBe(1500);
    expect(q.vat).toBe(0);
    expect(q.profit).toBe(500);
  });

  it("a used line without a cost is never counted as free", () => {
    const q = priceQuote(
      {
        method: "margin",
        value: 20,
        lines: [{ id: "trip", label: "رحلة", unit: "trip", cost: 0 }, ...lines.slice(1)],
      },
      { trip: 10, night: 1 },
      0,
      15,
    );
    expect(q.status).toBe("needs_costs");
    expect(q.missing).toEqual(["trip"]);
    expect(q.price).toBe(0);
  });

  it("empty, invalid and unpriced states", () => {
    expect(priceQuote({ method: "margin", value: 20, lines }, {}, 0, 15).status).toBe("empty");
    expect(priceQuote({ method: "margin", value: 100, lines }, { trip: 1 }, 0, 15).status).toBe(
      "invalid",
    );
    expect(priceQuote({ method: "fixed", value: 0, lines }, { trip: 1 }, 0, 15).status).toBe(
      "needs_price",
    );
  });

  it("rounds to the halala and keeps fractional quantities exact", () => {
    const q = priceQuote(
      { method: "markup", value: 10, lines: [{ id: "a", label: "a", unit: "fixed", cost: 33.33 }] },
      { a: 3 },
      0,
      15,
    );
    expect(q.cost).toBe(99.99);
    expect(q.price).toBe(109.99);
  });
});

describe("readiness of a coming-soon product", () => {
  it("does not ask for packages or costs", () => {
    const content = {
      comingSoon: true,
      hero: { title: "ا", subtitle: "ب" },
      packages: [],
      process: [],
      intake: [{}],
      faq: [],
      deliverables: [],
    };
    const r = productReadiness(
      content,
      { method: "markup", value: 0, lines: [], packages: [] },
      15,
    );
    expect(r.find((x) => x.key === "packages")?.ok).toBe(true);
    expect(r.find((x) => x.key === "costs")?.ok).toBe(true);
    expect(r.find((x) => x.key === "hero")?.ok).toBe(true);
  });
});

describe("packageQuote and readiness", () => {
  const pricing = {
    method: "margin" as const,
    value: 25,
    lines,
    packages: [{ packageId: "p1", qty: { trip: 6 }, fixedPrice: 0 }],
  };
  it("uses the package's typical quantities", () => {
    expect(packageQuote(pricing, "p1", 15).cost).toBe(600);
    expect(packageQuote(pricing, "missing", 15).status).toBe("empty");
  });
  it("lists what is missing before publishing", () => {
    const content = {
      hero: { title: "ا", subtitle: "" },
      packages: [{ id: "p1", name: "ن" }],
      process: [],
      intake: [],
      faq: [],
      deliverables: [],
    };
    const r = productReadiness(content, pricing, 15);
    expect(r.find((x) => x.key === "costs")?.ok).toBe(true);
    expect(r.find((x) => x.key === "hero")?.ok).toBe(false);
    expect(r.filter((x) => !x.ok).length).toBe(4);
  });
});
