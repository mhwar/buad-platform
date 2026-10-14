import { fromRiyals, toRiyals } from "./money";

/* ─────────────────────────────────────────────────────────────────────────────
 * Product pricing (a planning tool): cost lines × quantities → cost, price, VAT, profit, margin.
 * Inputs are riyals as typed by the user; everything is computed in whole halalas and returned
 * rounded to 2 decimals. Nothing here is a ledger entry, and no figure is ever invented: a line
 * with no cost makes the quote «needs_costs» instead of silently counting as zero.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PricingLineIn = { id: string; label: string; unit: string; cost: number };
export type PricingIn = {
  method: "margin" | "markup" | "fixed";
  /** Percent, for margin and markup. */
  value: number;
  lines: PricingLineIn[];
  packages: { packageId: string; qty: Record<string, number>; fixedPrice: number }[];
};

export type QuoteStatus = "empty" | "needs_costs" | "needs_price" | "invalid" | "ok";

export type Quote = {
  status: QuoteStatus;
  /** Cost lines used (qty > 0) that have no cost yet. */
  missing: string[];
  lines: {
    id: string;
    label: string;
    unit: string;
    qty: number;
    unitCost: number;
    amount: number;
  }[];
  cost: number;
  price: number;
  vat: number;
  total: number;
  profit: number;
  /** profit ÷ price. */
  marginPct: number;
  /** profit ÷ cost. */
  markupPct: number;
  /** The margin left if every cost rose by 10% and the price stayed. */
  marginIfCostUp10: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EMPTY: Omit<Quote, "status" | "missing" | "lines" | "cost"> = {
  price: 0,
  vat: 0,
  total: 0,
  profit: 0,
  marginPct: 0,
  markupPct: 0,
  marginIfCostUp10: 0,
};

/** One quote: `qty` per cost-line id, `fixedPrice` (riyals, before VAT) used when method = fixed. */
export function priceQuote(
  model: Pick<PricingIn, "method" | "value" | "lines">,
  qty: Record<string, number>,
  fixedPrice: number,
  vatRatePct: number,
): Quote {
  const used = model.lines
    .map((l) => ({ l, q: Number(qty[l.id] ?? 0) }))
    .filter((x) => Number.isFinite(x.q) && x.q > 0);
  let costH = 0;
  const lines = used.map(({ l, q }) => {
    const unitH = fromRiyals(Math.max(0, l.cost));
    const amountH = Math.round(unitH * q);
    costH += amountH;
    return {
      id: l.id,
      label: l.label,
      unit: l.unit,
      qty: q,
      unitCost: toRiyals(unitH),
      amount: toRiyals(amountH as never),
    };
  });
  const missing = used.filter((x) => !(x.l.cost > 0)).map((x) => x.l.id);
  const base = { missing, lines, cost: toRiyals(costH as never) };
  if (!used.length) return { status: "empty", ...base, ...EMPTY };
  if (missing.length) return { status: "needs_costs", ...base, ...EMPTY };

  let priceH: number;
  if (model.method === "fixed") {
    priceH = fromRiyals(Math.max(0, fixedPrice));
    if (!priceH) return { status: "needs_price", ...base, ...EMPTY };
  } else if (model.method === "margin") {
    if (model.value >= 100) return { status: "invalid", ...base, ...EMPTY };
    priceH = Math.round(costH / (1 - model.value / 100));
  } else {
    priceH = Math.round(costH * (1 + model.value / 100));
  }
  const vatH = Math.round((priceH * Math.max(0, vatRatePct)) / 100);
  const profitH = priceH - costH;
  return {
    status: "ok",
    ...base,
    price: toRiyals(priceH as never),
    vat: toRiyals(vatH as never),
    total: toRiyals((priceH + vatH) as never),
    profit: toRiyals(profitH as never),
    marginPct: priceH > 0 ? r2((profitH / priceH) * 100) : 0,
    markupPct: costH > 0 ? r2((profitH / costH) * 100) : 0,
    marginIfCostUp10: priceH > 0 ? r2(((priceH - costH * 1.1) / priceH) * 100) : 0,
  };
}

/** The quote of a package at its typical quantities. */
export function packageQuote(model: PricingIn, packageId: string, vatRatePct: number): Quote {
  const p = model.packages.find((x) => x.packageId === packageId);
  return priceQuote(model, p?.qty ?? {}, p?.fixedPrice ?? 0, vatRatePct);
}

/* ───────────────────────── readiness (what is missing before a product is publishable) */

type ContentIn = {
  comingSoon?: boolean;
  hero: { title: string; subtitle: string };
  packages: { id: string; name: string }[];
  process: unknown[];
  intake: unknown[];
  faq: unknown[];
  deliverables: unknown[];
};

export type ReadinessItem = { key: string; label: string; ok: boolean; hint: string };

export function productReadiness(
  content: ContentIn,
  pricing: PricingIn,
  vatRatePct: number,
): ReadinessItem[] {
  // A coming-soon product only introduces itself and collects interest: no packages or costs yet.
  const soon = !!content.comingSoon;
  const priced = content.packages.filter(
    (p) => packageQuote(pricing, p.id, vatRatePct).status === "ok",
  ).length;
  return [
    {
      key: "hero",
      label: "عنوان ووصف للمنتج",
      ok: !!content.hero.title && !!content.hero.subtitle,
      hint: "في «التعريف»",
    },
    {
      key: "packages",
      label: "باقة واحدة على الأقل",
      ok: soon || content.packages.length > 0,
      hint: "في «الباقات»",
    },
    {
      key: "costs",
      label: "تسعير كل الباقات من تكلفتها الفعلية",
      ok: soon || (content.packages.length > 0 && priced === content.packages.length),
      hint: "أدخل تكلفة كل بند وكمياته في «التكلفة والتسعير»",
    },
    {
      key: "intake",
      label: "أسئلة طلب العرض",
      ok: content.intake.length > 0,
      hint: "في «الاستبيان»",
    },
    {
      key: "process",
      label: "مراحل التشغيل (3 على الأقل)",
      ok: content.process.length >= 3,
      hint: "في «التشغيل والمحتوى»",
    },
    {
      key: "faq",
      label: "سؤالان شائعان على الأقل",
      ok: content.faq.length >= 2,
      hint: "في «التشغيل والمحتوى»",
    },
  ];
}
