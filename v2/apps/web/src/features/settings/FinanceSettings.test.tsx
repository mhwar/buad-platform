import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { FinanceSettingsPage } from "./FinanceSettings";

afterEach(() => vi.unstubAllGlobals());

const DEFAULTS = {
  vatIncluded: false,
  vatPct: 15,
  execV: 10,
  execType: "pct",
  execBase: "gross",
  mktV: 0,
  mktType: "pct",
  mktBase: "gross",
  cbV: 0,
  cbType: "pct",
  cbBase: "gross",
  cfV: 0,
  cfType: "pct",
  cfBase: "net",
};
const settings = (extra = {}) => ({
  ok: true,
  projectDefaults: DEFAULTS,
  projectDefaultsSet: false,
  targets: {},
  cashOpening: null,
  ...extra,
});

describe("FinanceSettingsPage", () => {
  it("starts empty, says where the target comes from, and saves the year's target", async () => {
    const year = new Date().getFullYear();
    const calls = stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
      "GET /api/org/settings": () => settings(),
      "PATCH /api/org/settings": () => settings({ targets: { [year]: 2000000 } }),
      "GET /api/finance/year-review": () => ({
        ok: true,
        items: [],
        counts: {},
        totals: { target: 1500000, targetSource: "plan", revenue: 0 },
      }),
    });
    await renderWithApp(<FinanceSettingsPage />);
    expect(await screen.findByText(/من الخطة الآن/)).toBeInTheDocument();
    expect(screen.getByText(/تعمل المنصة الآن بقيمها الأصلية/)).toBeInTheDocument();
    const field = screen.getByLabelText(`مستهدف ${year} (ر.س)`);
    await userEvent.type(field, "2000000");
    await userEvent.click(screen.getByRole("button", { name: `حفظ مستهدف ${year}` }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        targets: { [year]: 2000000 },
      }),
    );
  });

  it("is read-only for those who may only look", async () => {
    stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("accountant") }),
      "GET /api/org/settings": () => settings(),
    });
    await renderWithApp(<FinanceSettingsPage />);
    expect(await screen.findByLabelText("الرصيد (ر.س)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "حفظ الشروط" })).toBeNull();
  });
});
