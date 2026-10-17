import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { SECTIONS } from "../more/tabs";
import { SettingsHome } from "./SettingsHome";
import { SettingsLayout } from "./SettingsLayout";

afterEach(() => vi.unstubAllGlobals());
const me = (role: string) => () => ({ user: meUser(role) });

describe("SettingsLayout", () => {
  it("shows the import option to the owner", async () => {
    stubApi({ "GET /api/me": me("owner") });
    await renderWithApp(<SettingsLayout />);
    expect(await screen.findByRole("link", { name: /الاستيراد/ })).toHaveAttribute(
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
    expect(screen.queryByRole("link", { name: /الاستيراد/ })).toBeNull();
  });

  it("lists the same pages, in the same order, as the sidebar", async () => {
    stubApi({ "GET /api/me": me("owner") });
    await renderWithApp(<SettingsLayout />);
    await screen.findByRole("link", { name: /الاستيراد/ });
    const nav = screen.getByRole("navigation", { name: "الإعدادات" });
    const names = [...nav.querySelectorAll("a")].map((a) => a.textContent?.trim());
    const settings = SECTIONS.find((s) => s.key === "settings");
    expect(names).toEqual(settings?.tabs?.map((t) => t.label));
  });
});

describe("SettingsHome", () => {
  it("counts what «بيانات الجهة» holds and names what is missing", async () => {
    stubApi({
      "GET /api/me": me("owner"),
      "GET /api/org/profile": () => ({
        ok: true,
        profile: { name: "بُعد", reg: "1010", tax: "", signerName: "", urls: {}, version: 1 },
      }),
    });
    await renderWithApp(<SettingsHome />);
    expect(await screen.findByText("2 من 10 مكتمل")).toBeInTheDocument();
    expect(screen.getByText(/الرقم الضريبي، المفوض بالتوقيع/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "أكملوها" })).toHaveAttribute("href", "/settings/org");
  });
});
