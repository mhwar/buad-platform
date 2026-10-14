import { layoutSchema } from "@buad/schema/documents";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentView } from "./DocumentView";

const org = {
  name: "مؤسسة بُعد",
  urls: {
    headerAsset: "/h.png",
    footerAsset: "",
    logoAsset: "",
    stampAsset: "/s.png",
    signatureAsset: "",
  },
};
const values = {
  party_a_name: { value: "مؤسسة بُعد", source: "org" as const },
  party_b_name: { value: "جمعية أجيالنا", source: "client" as const },
  contract_amount: { value: "65,000", source: "finance" as const },
  contract_amount_words: { value: "خمسة وستون ألفاً", source: "computed" as const },
};
const clause = {
  id: "c1",
  key: "financial",
  title: "المادة الأولى: المقابل المالي",
  baseTitle: "المقابل المالي",
  content:
    "مبلغ {{contract_amount}} (فقط {{contract_amount_words}}) يدفعه {{party_b_name}}.\n\nالرقم الضريبي: {{party_b_tax}}",
  pageBreak: false,
};

describe("DocumentView", () => {
  it("fills variables and flags empty ones while editing", () => {
    render(
      <DocumentView
        kind="contract"
        number="CT-1"
        title="عقد"
        content={[clause]}
        layout={layoutSchema.parse({ useOrgStamp: true })}
        values={values}
        org={org}
        editing
      />,
    );
    expect(screen.getByText("خمسة وستون ألفاً")).toBeInTheDocument();
    expect(screen.getByText("الرقم الضريبي للطرف الثاني")).toHaveClass("doc-var-empty");
    expect(screen.getByAltText("الختم")).toHaveAttribute("src", "/s.png");
  });

  it("prints a blank line (not the variable name) for an empty value", () => {
    render(
      <DocumentView
        kind="contract"
        number="CT-1"
        title="عقد"
        content={[clause]}
        layout={layoutSchema.parse({})}
        values={values}
        org={org}
      />,
    );
    expect(screen.queryByText("الرقم الضريبي للطرف الثاني")).toBeNull();
    expect(screen.getByText("…………")).toBeInTheDocument();
    expect(screen.queryByAltText("الختم")).toBeNull(); // stamp only when chosen
  });
});
