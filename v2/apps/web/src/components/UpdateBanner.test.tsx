import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const load = async (build: string) => {
  vi.stubEnv("VITE_APP_VERSION", build);
  return (await import("./UpdateBanner")).UpdateBanner;
};

describe("UpdateBanner", () => {
  it("offers a reload when the server runs a newer deploy", async () => {
    stubApi({
      "GET /api/health": () => ({ ok: true, service: "buad-v2-api", version: "bbbbbbb" }),
    });
    const UpdateBanner = await load("aaaaaaa1234");
    await renderWithApp(<UpdateBanner />);
    expect(await screen.findByRole("button", { name: /تحديث الآن/ })).toBeInTheDocument();
  });

  it("stays hidden when versions match, and in local development", async () => {
    stubApi({
      "GET /api/health": () => ({ ok: true, service: "buad-v2-api", version: "aaaaaaa" }),
    });
    const Same = await load("aaaaaaa1234");
    const { unmount } = await renderWithApp(<Same />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /تحديث الآن/ })).toBeNull();
    unmount();
    vi.resetModules();
    const Dev = await load("");
    await renderWithApp(<Dev />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /تحديث الآن/ })).toBeNull();
  });
});
