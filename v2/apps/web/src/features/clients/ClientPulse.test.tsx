import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ClientPulse } from "./ClientPulse";

afterEach(() => vi.unstubAllGlobals());

const routes = (role: string) => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/crm/clients/c1": () => ({
    ok: true,
    relationship: "active",
    crm: {
      ownerId: "",
      ownerName: "",
      source: "",
      tags: [],
      nextFollowUpAt: "2020-01-01",
      lastContactAt: Math.floor(Date.now() / 1000) - 86400 * 2,
    },
    activities: [],
  }),
  "GET /api/product-requests": () => ({
    requests: [
      { id: "r1", clientId: "c1", status: "proposal", value: 40000 },
      { id: "r2", clientId: "c1", status: "won", value: 9000 },
      { id: "r3", clientId: "c2", status: "new", value: 1000 },
    ],
    counts: {},
  }),
  "GET /api/clients/c1/statement": () => ({ totals: { owed: 25000 } }),
});

describe("ClientPulse", () => {
  it("sums up running work, open opportunities, money owed and the follow-up", async () => {
    stubApi(routes("owner"));
    await renderWithApp(
      <ClientPulse clientId="c1" active={2} total={3} onProjects={() => {}} onCrm={() => {}} />,
    );
    const pulse = screen.getByRole("list", { name: "نبض العميل" });
    expect(within(pulse).getByText("جارية من 3")).toBeInTheDocument();
    expect(await within(pulse).findByText(/40,000/)).toBeInTheDocument();
    expect(await within(pulse).findByText(/25,000/)).toBeInTheDocument();
    expect(await within(pulse).findByText(/متأخرة ·/)).toBeInTheDocument();
    expect(within(pulse).getByText(/آخر تواصل/)).toBeInTheDocument();
  });

  it("hides the money and the opportunities from a viewer", async () => {
    const calls = stubApi(routes("viewer"));
    await renderWithApp(
      <ClientPulse clientId="c1" active={1} total={1} onProjects={() => {}} onCrm={() => {}} />,
    );
    await screen.findByText(/متأخرة ·/);
    expect(calls.some((c) => c.path.includes("statement"))).toBe(false);
    expect(calls.some((c) => c.path.includes("product-requests"))).toBe(false);
  });
});
