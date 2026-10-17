import { describe, expect, it } from "vitest";
import {
  filingDueDate,
  invoiceGaps,
  receiptParts,
  vatInsideHalalas,
  vatOfGrossHalalas,
  vatPeriodKey,
  vatReturn,
} from "./vat";

describe("VAT", () => {
  it("extracts the VAT from a price that includes it, to the halala", () => {
    expect(vatOfGrossHalalas(11500, 15)).toBe(1500);
    expect(vatOfGrossHalalas(10000, 15)).toBe(1304); // 1304.35
    expect(vatOfGrossHalalas(10000, 0)).toBe(0);
  });

  it("splits a receipt by the contract's own VAT share (partial, 0% VAT, refund)", () => {
    const c = { gross: 115000, net: 100000, vat: 15000 };
    expect(receiptParts(57500, c)).toEqual({ base: 50000, vat: 7500 });
    expect(receiptParts(-11500, c)).toEqual({ base: -10000, vat: -1500 });
    expect(receiptParts(5000, { gross: 5000, net: 5000, vat: 0 })).toEqual({ base: 5000, vat: 0 });
    expect(receiptParts(100, { gross: 0, net: 0, vat: 0 })).toEqual({ base: 100, vat: 0 });
  });

  it("builds the return: output − input = net payable", () => {
    const r = vatReturn(
      [
        { base: 50000, vat: 7500 },
        { base: 20000, vat: 3000 },
      ],
      [{ base: 8000, vat: 1200 }],
    );
    expect(r).toMatchObject({ outputVat: 10500, inputVat: 1200, netPayable: 9300 });
    expect(r.sales.base).toBe(70000);
    expect(vatReturn([], [{ base: 100, vat: 15 }]).netPayable).toBe(-15); // refundable
  });

  it("says what an invoice still lacks", () => {
    expect(
      invoiceGaps({
        supplierName: "مورد",
        supplierVatNo: "300000000000003",
        invoiceNo: "A-1",
        invoiceDate: "2026-08-01",
      }),
    ).toEqual([]);
    expect(
      invoiceGaps({ supplierName: "", supplierVatNo: "123", invoiceNo: "", invoiceDate: "" }),
    ).toEqual(["supplier", "vat_no", "invoice_no", "invoice_date"]);
  });
});

describe("filing dates", () => {
  it("are the last day of the month after the quarter", () => {
    expect(filingDueDate(2026, 1)).toBe("2026-04-30");
    expect(filingDueDate(2026, 3)).toBe("2026-10-31");
    expect(filingDueDate(2026, 4)).toBe("2027-01-31");
    expect(vatPeriodKey(2026, 2)).toBe("2026-Q2");
    expect(vatInsideHalalas(11500, 15)).toBe(1500);
  });
});
