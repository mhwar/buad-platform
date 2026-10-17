import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { FinanceChecks } from "./FinanceChecks";

afterEach(() => vi.unstubAllGlobals());

describe("FinanceChecks", () => {
  it("lists what needs a person, each line linking to where it is fixed", async () => {
    stubApi({
      "GET /api/finance/checks": () => ({
        ok: true,
        checks: [
          {
            key: "unapproved_receipts",
            title: "استلامات غير معتمدة",
            hint: "لا تُحتسب",
            rows: [
              {
                label: "PRJ-2026-0010 · اليوم الوطني",
                detail: "10,000 ر.س بتاريخ 2026-10-14",
                link: "/projects/p1?view=finance",
              },
            ],
          },
        ],
      }),
    });
    await renderWithApp(<FinanceChecks />);
    expect(await screen.findByText(/تحتاج تدخلك: 1 ملاحظة/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PRJ-2026-0010/ })).toHaveAttribute(
      "href",
      "/projects/p1?view=finance",
    );
  });

  it("shows nothing when the figures are clean", async () => {
    stubApi({ "GET /api/finance/checks": () => ({ ok: true, checks: [] }) });
    const { container } = await renderWithApp(<FinanceChecks />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("details")).toBeNull();
  });
});
