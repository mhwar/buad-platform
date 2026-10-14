/* Quote arithmetic in halalas. Pure: the API and the printed page use the same numbers. */

export type QuoteItem = { label: string; qty: number; unitHalalas: number };
export type QuoteTotals = {
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
};

const round = (n: number) => Math.round(n);

/** Subtotal − discount = taxable amount; VAT is on that; total = taxable + VAT. */
export function quoteTotals(
  items: QuoteItem[],
  discountHalalas: number,
  vatPct: number,
): QuoteTotals {
  const subtotal = items.reduce((s, i) => s + round(i.qty * i.unitHalalas), 0);
  const discount = Math.min(Math.max(0, round(discountHalalas)), subtotal);
  const net = subtotal - discount;
  const vat = round((net * Math.max(0, vatPct)) / 100);
  return { subtotal, discount, net, vat, total: net + vat };
}

/** Whether an offer can still be accepted on `today` (no validity date means open). */
export const quoteIsValid = (validUntil: string, today: string) =>
  !validUntil || validUntil >= today;

/** Weight of each pipeline stage when forecasting what the open leads are worth. */
export const STAGE_PROBABILITY = {
  new: 0.1,
  contacted: 0.2,
  quoted: 0.4,
  negotiating: 0.65,
} as const;

export function weightedPipeline(leads: { status: string; valueHalalas: number }[]): number {
  return round(
    leads.reduce(
      (s, l) =>
        s + l.valueHalalas * (STAGE_PROBABILITY[l.status as keyof typeof STAGE_PROBABILITY] ?? 0),
      0,
    ),
  );
}
