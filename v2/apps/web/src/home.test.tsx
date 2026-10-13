import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Home } from "./home";
import { renderWithApp, stubApi } from "./test-utils";

afterEach(() => vi.unstubAllGlobals());

describe("Home", () => {
  it("summarises clients and active projects", async () => {
    stubApi({
      "GET /api/me": () => ({ ok: true, user: { id: "u", name: "سلطان", role: "owner" } }),
      "GET /api/clients": () => ({ items: [], counts: { company: 2, association: 1 } }),
      "GET /api/projects": () => ({
        items: [
          {
            id: "p1",
            name: "برنامج",
            clientName: "الأفق",
            status: "active",
            contractTotal: 150000,
          },
          { id: "p2", name: "قديم", clientName: "البر", status: "completed", contractTotal: 99900 },
        ],
        counts: { active: 1, completed: 1 },
      }),
    });
    await renderWithApp(<Home />);
    expect(await screen.findByText("أهلاً سلطان")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument(); // clients
    expect(screen.getByText("برنامج")).toBeInTheDocument();
    expect(screen.getByText(/1,500\.00|١٬٥٠٠/)).toBeInTheDocument(); // only the active project's value
  });
});
