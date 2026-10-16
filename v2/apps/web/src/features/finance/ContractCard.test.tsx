import { summarize } from "@buad/domain";
import { DEFAULT_CTRL } from "@buad/schema/finance";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import type { Finance } from "./api";
import { ContractCard } from "./ContractCard";

afterEach(() => vi.unstubAllGlobals());

function finance(received: number): Finance {
  const ctrl = { ...DEFAULT_CTRL, contractValue: 10_000_000, version: 1, updatedAt: null };
  return {
    ctrl,
    entries: [],
    budget: [],
    categories: [],
    receipts: received
      ? [
          {
            id: "r1",
            date: "2026-02-01",
            amount: received * 100,
            note: "",
            basis: "",
            approvedBy: "",
            approvedAt: 1,
          } as never,
        ]
      : [],
    received,
    summary: summarize({ ctrl, entries: [], budget: [] }),
  };
}

const routes = (received: number, items: object[]) => ({
  "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
  "GET /api/projects/p1/finance": () => finance(received),
  "GET /api/receivables/projects/p1": () => ({ ok: true, items }),
});

describe("the contract and collection card", () => {
  it("says what the contract is worth, how much came in, and what remains on the client", async () => {
    stubApi(routes(23_000, []));
    await renderWithApp(<ContractCard projectId="p1" canEdit onSettings={() => {}} />);
    const card = within(await screen.findByLabelText("العقد والتحصيل"));
    expect(card.getAllByText(/115,000/).length).toBeGreaterThan(0); // 100,000 + 15% VAT
    expect(card.getByText("20%")).toBeInTheDocument();
    expect(card.getByText(/المتبقي على العميل/)).toHaveTextContent(/92,000/);
    // starts on the summary, and offers receipts and the schedule
    expect(card.getByRole("tab", { name: "الملخص" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(card.getByRole("tab", { name: /الاستلامات \(1\)/ }));
    expect(card.getByRole("button", { name: /تسجيل استلام/ })).toBeInTheDocument();
  });

  it("opens on the schedule when a payment is late, and flags it", async () => {
    stubApi(
      routes(0, [
        {
          id: "i1",
          label: "الدفعة الأولى",
          dueDate: "2020-01-01",
          amount: 5000,
          status: "pending",
        },
      ]),
    );
    await renderWithApp(<ContractCard projectId="p1" canEdit onSettings={() => {}} />);
    const card = within(await screen.findByLabelText("العقد والتحصيل"));
    expect(await card.findByText(/دفعة متأخرة/)).toBeInTheDocument();
    expect(card.getByRole("tab", { name: /الدفعات \(1\)/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await card.findByText("الدفعة الأولى")).toBeInTheDocument();
  });

  it("a reader sees no add buttons", async () => {
    stubApi(routes(0, []));
    await renderWithApp(<ContractCard projectId="p1" canEdit={false} onSettings={() => {}} />);
    const card = within(await screen.findByLabelText("العقد والتحصيل"));
    await userEvent.click(card.getByRole("tab", { name: /الدفعات/ }));
    expect(card.queryByRole("button", { name: /دفعة/ })).toBeNull();
    expect(card.getByText("لا دفعات مجدولة.")).toBeInTheDocument();
  });
});
