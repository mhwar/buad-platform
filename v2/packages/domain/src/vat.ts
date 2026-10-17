/* ─────────────────────────────────────────────────────────────────────────────
 * VAT: the quarterly return from what the platform knows.
 *  - Sales: each approved receipt carries its share of the contract's VAT (by the day the
 *    money arrived), so a half payment is half the VAT and a refund reduces it.
 *  - Purchases: expenses registered with a tax invoice carry the VAT stated on it.
 * Pure. Amounts in riyals unless a name says halalas.
 * ──────────────────────────────────────────────────────────────────────────── */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The VAT inside a price that already includes it (halalas in, halalas out). */
export const vatOfGrossHalalas = (grossHalalas: number, ratePct: number) =>
  ratePct <= 0 ? 0 : Math.round((grossHalalas * ratePct) / (100 + ratePct));

/** A contract's money split into its net and VAT parts (from finCalc). */
export type ContractParts = { gross: number; net: number; vat: number };

/** The net and VAT carried by one receipt (negative for a refund): proportional to the contract. */
export function receiptParts(receipt: number, c: ContractParts) {
  if (c.gross <= 0) return { base: r2(receipt), vat: 0 };
  const vat = r2((receipt * c.vat) / c.gross);
  return { base: r2(receipt - vat), vat };
}

export type VatLine = { base: number; vat: number };

const total = (rows: VatLine[]): VatLine => ({
  base: r2(rows.reduce((s, r) => s + r.base, 0)),
  vat: r2(rows.reduce((s, r) => s + r.vat, 0)),
});

/**
 * The return in the order of the ZATCA form (standard-rated only): taxable sales and the
 * VAT due on them, taxable purchases and the VAT claimable, and the net payable
 * (negative = refundable).
 */
export function vatReturn(sales: VatLine[], purchases: VatLine[]) {
  const s = total(sales);
  const p = total(purchases);
  return {
    sales: s,
    purchases: p,
    outputVat: s.vat,
    inputVat: p.vat,
    netPayable: r2(s.vat - p.vat),
  };
}

/** What a purchase with a tax invoice must state to be relied on in an audit. */
export function invoiceGaps(p: {
  supplierName: string;
  supplierVatNo: string;
  invoiceNo: string;
  invoiceDate: string;
}) {
  const gaps: ("supplier" | "vat_no" | "invoice_no" | "invoice_date")[] = [];
  if (!p.supplierName.trim()) gaps.push("supplier");
  if (!/^3\d{13}3$/.test(p.supplierVatNo.trim())) gaps.push("vat_no");
  if (!p.invoiceNo.trim()) gaps.push("invoice_no");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.invoiceDate)) gaps.push("invoice_date");
  return gaps;
}

/** "2026-Q3": the key of a quarter's VAT return. */
export const vatPeriodKey = (year: number, q: number) => `${year}-Q${q}`;

/**
 * When a quarter's return is due: filed and paid by the last day of the month after the
 * quarter (ZATCA, quarterly filers). Q4 falls in January of the next year.
 */
export function filingDueDate(year: number, q: number): string {
  const month = q * 3 + 1; // 1-based month after the quarter
  const y = month > 12 ? year + 1 : year;
  const m = month > 12 ? month - 12 : month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** The VAT inside an amount that includes it, in halalas (e.g. 15% → 15/115 of it). */
export const vatInsideHalalas = (grossHalalas: number, ratePct: number) =>
  Math.round((grossHalalas * ratePct) / (100 + ratePct));
