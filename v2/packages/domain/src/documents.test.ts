import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_TEMPLATES,
  type DocContext,
  fillText,
  formatGregorian,
  initialVariables,
  numberToArabicWords,
  resolveVariables,
  segments,
  toHijri,
  unwrapLiteralBraces,
} from "./index";

/** v1's own number-to-words, loaded from app.html so the port is checked against the source. */
function v1NumToArabic(): (n: number) => string {
  const html = readFileSync(resolve(__dirname, "../../../../app.html"), "utf8");
  const start = html.indexOf("Pages._numToArabic = function(n) {");
  const end = html.indexOf("\n};\n", start) + 3;
  const Pages: Record<string, (n: number) => string> = {};
  new Function("Pages", html.slice(start, end))(Pages);
  return Pages._numToArabic as (n: number) => string;
}

const ctx: DocContext = {
  org: {
    name: "مؤسسة بُعد التمكين",
    email: "info@baad.sa",
    phone: "0550000000",
    website: "baad.sa",
    address: "أبها",
    reg: "5850135201",
    tax: "300000000000003",
    signerName: "سلطان عسيري",
    signerTitle: "المدير التنفيذي",
    signerId: "1000000000",
    bankName: "الراجحي",
    bankIban: "SA00 0000",
  },
  client: {
    name: "جمعية أجيالنا الشبابية",
    contactName: "عبدالرحمن القرني",
    contactTitle: "المدير التنفيذي",
    regNo: "1118",
    taxNo: "",
    address: "",
    city: "أبها",
    phone: "0505959657",
    email: "a@x.sa",
  },
  project: { name: "أكاديمية ق" },
  finance: {
    grossTotal: 65000.4,
    cashback: 3250,
    contractNo: "CON-2026-007",
    contractDate: "2025-03-01",
  },
  today: "2026-10-14",
};

describe("amount in words", () => {
  it("equals v1 for every number v1 supports (sampled to 1,000,000)", () => {
    const v1 = v1NumToArabic();
    for (let n = 1; n <= 1_000_000; n += n < 2000 ? 1 : 997)
      expect(numberToArabicWords(n), String(n)).toBe(v1(n));
  });
  it("goes beyond millions and rounds like v1", () => {
    expect(numberToArabicWords(2_000_000_000)).toBe("ملياران");
    expect(numberToArabicWords(1_250_000_000)).toBe("مليار ومئتان وخمسون مليوناً");
    expect(numberToArabicWords(65000.4)).toBe("خمسة وستون ألفاً");
    expect(numberToArabicWords(0)).toBe("");
  });
});

describe("dates", () => {
  it("fills the Hijri date v1 never filled (Umm al-Qura)", () => {
    expect(toHijri("2025-03-01")).toBe("1 رمضان 1446");
    expect(toHijri("")).toBe("");
    expect(formatGregorian("2025-03-01")).toBe("01/03/2025");
  });
});

describe("variables", () => {
  it("starts a contract with v1's mapping, and says where each value came from", () => {
    const v = initialVariables(ctx);
    expect(v.party_b_name).toEqual({ value: "جمعية أجيالنا الشبابية", source: "client" });
    expect(v.party_b_id?.value).toBe("1118");
    expect(v.party_b_address?.value).toBe("أبها"); // address empty → city, like v1
    expect(v.party_a_rep_name).toEqual({ value: "سلطان عسيري", source: "org" });
    expect(v.contract_amount).toEqual({ value: "65,000", source: "finance" });
    expect(v.contract_no).toEqual({ value: "CON-2026-007", source: "finance" });
    expect(v.contract_date_gregorian).toEqual({ value: "2025-03-01", source: "finance" });
    expect(v.subject?.value).toBe("أكاديمية ق");
  });

  it("resolves every token used by every v1 template", () => {
    const stored = Object.fromEntries(
      Object.entries(initialVariables(ctx)).map(([k, v]) => [k, v.value]),
    );
    const values = resolveVariables(stored, ctx);
    for (const t of Object.values(CONTRACT_TEMPLATES))
      for (const c of t.clauses)
        for (const s of segments(c.content, values))
          if ("key" in s && s.key !== "party_b_tax")
            expect(s.empty, `${c.key}: ${s.key}`).toBe(false);
    expect(values.contract_amount_words?.value).toBe("خمسة وستون ألفاً");
    expect(values.contract_date_hijri?.value).toBe("1 رمضان 1446");
    expect(values.cashback_amount?.value).toBe("3,250");
  });

  it("leaves unknown or empty variables visible instead of printing nothing", () => {
    expect(
      fillText("رقم {{contract_no}} و{{nope}}", resolveVariables({ contract_no: "CT-1" }, ctx)),
    ).toBe("رقم CT-1 و{{nope}}");
  });
});

describe("literal braces from v1", () => {
  it("keeps variables, unwraps typed values", () => {
    expect(
      unwrapLiteralBraces(
        "بمدينة {{أبها}} رقم {{1000714900}} وعنوانه {{ عسير - أبها }} في {{contract_date}}",
      ),
    ).toBe("بمدينة أبها رقم 1000714900 وعنوانه عسير - أبها في {{contract_date}}");
  });
  it("only latin keys are variables", () => {
    const parts = segments("رقم {{1000714900}} و{{contract_no}}", {});
    expect(parts.filter((p) => "key" in p).map((p) => ("key" in p ? p.key : ""))).toEqual([
      "contract_no",
    ]);
  });
});
