import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ReceiptFlow } from "./ReceiptFlow";

afterEach(() => vi.unstubAllGlobals());

const line = (o: object) => ({
  id: "s1",
  projectId: "p1",
  label: "الدفعة الثانية",
  dueDate: "2020-05-01",
  amount: 30000,
  status: "pending",
  receivedAt: "",
  ...o,
});
const routes = (lines: object[]) => ({
  "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
  "GET /api/projects": () => ({
    ok: true,
    counts: {},
    items: [
      {
        id: "p1",
        name: "مبادرة سكن كريم",
        clientName: "جمعية الإسكان",
        status: "active",
        contractTotal: 11500000,
        received: 2000000,
      },
    ],
  }),
  "GET /api/receivables/projects/p1": () => ({ ok: true, items: lines }),
  "POST /api/receivables/s1/receive": () => ({ ok: true, receiptId: "r1", rest: 0 }),
  "POST /api/projects/p1/finance/receipts": () => ({ ok: true }),
});

describe("ReceiptFlow — «تسجيل مقبوض»", () => {
  it("from anywhere: pick the project, and its waiting instalment is offered first", async () => {
    const calls = stubApi(routes([line({})]));
    await renderWithApp(<ReceiptFlow onClose={() => {}} />);
    await screen.findByRole("option", { name: /مبادرة سكن كريم/ });
    await userEvent.selectOptions(screen.getByLabelText("المشروع"), "p1");
    expect(
      await screen.findByRole("dialog", { name: /تسجيل مقبوض — مبادرة سكن كريم/ }),
    ).toBeInTheDocument();
    const radio = await screen.findByRole("radio", { name: /الدفعة الثانية/ });
    expect(radio).toBeChecked();
    expect(screen.getByDisplayValue("30000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تسجيل المقبوض" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/receivables/s1/receive")?.body).toMatchObject({
        amount: 30000,
      }),
    );
  });

  it("without instalments it records an amount on its own, suggesting what remains", async () => {
    const calls = stubApi(routes([]));
    await renderWithApp(
      <ReceiptFlow
        project={{ id: "p1", name: "مبادرة سكن كريم", remaining: 95000 }}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByDisplayValue("95000")).toBeInTheDocument();
    expect(screen.queryByLabelText("المشروع")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "تسجيل المقبوض" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/projects/p1/finance/receipts")?.body).toMatchObject(
        { amount: 95000 },
      ),
    );
  });
});
