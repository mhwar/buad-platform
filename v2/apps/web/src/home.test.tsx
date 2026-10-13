import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./router";

afterEach(() => vi.unstubAllGlobals());

describe("Home", () => {
  it("shows the server version once health resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, service: "buad-v2-api", version: "9.9.9" })),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Home />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/الإصدار 9\.9\.9/)).toBeInTheDocument();
  });
});
