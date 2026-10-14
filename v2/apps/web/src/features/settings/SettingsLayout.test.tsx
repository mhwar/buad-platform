import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { SettingsLayout } from "./SettingsLayout";

afterEach(() => vi.unstubAllGlobals());
const me = (role: string) => () => ({ user: meUser(role) });

describe("SettingsLayout", () => {
  it("shows the import option to the owner", async () => {
    stubApi({ "GET /api/me": me("owner") });
    await renderWithApp(<SettingsLayout />);
    expect(await screen.findByRole("link", { name: /استيراد البيانات/ })).toHaveAttribute(
      "href",
      "/settings/import",
    );
    expect(screen.getByRole("link", { name: /بيانات الجهة/ })).toBeInTheDocument();
  });

  it("hides import from everyone else", async () => {
    stubApi({ "GET /api/me": me("admin") });
    await renderWithApp(<SettingsLayout />);
    expect(await screen.findByRole("link", { name: /حسابي/ })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link", { name: /استيراد البيانات/ })).toBeNull();
  });
});
