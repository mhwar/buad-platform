import { describe, expect, it } from "vitest";
import { planDocuments } from "./documents-plan";

const HEADER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const fin = {
  contracts: [
    {
      id: "k1",
      template_type: "service",
      title: "عقد تقديم خدمات",
      status: "final",
      updated: "2026-02-01",
      variables: {
        contract_no: "CON-2026-007",
        party_b_name: "جمعية أجيالنا",
        contract_amount: 65000,
        weird: { x: 1 },
      },
      clauses: [
        { id: "a", key: "opening", title: "أطراف العقد", content: "..." },
        {
          id: "b",
          key: "subject",
          title: "المادة الأولى: موضوع العقد",
          content: "{{subject}}",
          page_break: true,
        },
        { id: "c", key: "x", title: "المادة الثانية: محذوف", content: "", enabled: false },
      ],
      doc_style: { font_size: 12, line_height: 2, title_size: 22, clause_title_size: 15 },
      doc_margins: { right: 2.5, left: 2, top: 0, bottom: 0 },
      page_layout: { header: { show: true, image: HEADER }, footer: { show: false, image: "" } },
      footer_label: "سري",
      cover: { elements: [{ type: "logo" }] },
    },
  ],
  letters: [
    {
      id: "L1",
      type: "cashback",
      no: "15/2026",
      date: "2026-03-05",
      to_honorific: "السادة",
      to: "جمعية أجيالنا",
      recipient_suffix: "المحترمين",
      salutation: "السلام عليكم",
      show_closing: false,
      closing: "x",
      title: "كاش باك",
      body: "نص",
      signer_name: "سلطان",
      signer_title: "المدير",
      stamp_image: HEADER,
      page_layout: { header: { image: HEADER } },
    },
  ],
};

describe("planDocuments", () => {
  it("maps a v1 contract: status, variables (strings only), clauses (renumberable), layout, images", () => {
    const [c] = planDocuments("p1", fin);
    expect(c).toMatchObject({
      id: "v1doc_p1_k1",
      kind: "contract",
      status: "approved",
      templateKey: "service",
      title: "عقد تقديم خدمات",
      hadCover: true,
    });
    expect(c?.variables).toEqual({
      contract_no: "CON-2026-007",
      party_b_name: "جمعية أجيالنا",
      contract_amount: "65000",
    });
    expect(c?.content.map((x) => [x.title, x.baseTitle, x.pageBreak])).toEqual([
      ["أطراف العقد", "", false],
      ["", "موضوع العقد", true],
    ]);
    expect(c?.layout).toMatchObject({
      fontSize: 12,
      lineHeight: 2,
      titleSize: 22,
      clauseTitleSize: 15,
      marginX: 2.5,
      showHeader: true,
      showFooter: false,
      footerLabel: "سري",
    });
    expect(c?.images.header).toBe(HEADER);
  });

  it("maps a v1 letter, keeping its printed number, signer and stamp", () => {
    const l = planDocuments("p1", fin)[1];
    expect(l).toMatchObject({
      kind: "letter",
      v1Number: "15/2026",
      title: "كاش باك",
      status: "draft",
    });
    expect(l?.variables).toMatchObject({
      letter_to: "جمعية أجيالنا",
      letter_closing: "",
      letter_date: "2026-03-05",
      letter_signer_name: "سلطان",
    });
    expect(l?.layout.useOrgStamp).toBe(true);
    expect(l?.images.stamp).toBe(HEADER);
  });

  it("tolerates projects without documents", () => {
    expect(planDocuments("p1", {})).toEqual([]);
  });
});
