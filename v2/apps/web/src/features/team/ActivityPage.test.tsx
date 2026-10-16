import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ActivityPage } from "./ActivityPage";

afterEach(() => vi.unstubAllGlobals());

describe("ActivityPage", () => {
  it("shows what a change did, field by field", async () => {
    stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
      "GET /api/team/users": () => ({ ok: true, users: [] }),
      "GET /api/audit": () => ({
        ok: true,
        items: [
          {
            id: "a1",
            at: Math.floor(Date.now() / 1000),
            userId: "u1",
            userName: "سلطان",
            entity: "project",
            entityId: "p1",
            action: "update",
            summary: "تعديل مقبوضة",
            detail: {
              changes: [
                { field: "amount", label: "المبلغ", before: "50,000 ر.س", after: "5,000 ر.س" },
              ],
            },
          },
        ],
      }),
    });
    await renderWithApp(<ActivityPage />);
    const changes = await screen.findByRole("list", { name: "التغييرات" });
    expect(within(changes).getByText("50,000 ر.س")).toBeInTheDocument();
    expect(within(changes).getByText("5,000 ر.س")).toBeInTheDocument();
  });
});
