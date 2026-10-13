import { summarize } from "@buad/domain";
import { DEFAULT_CTRL } from "@buad/schema/finance";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import type { Finance } from "./api";
import { ContractSummary, FinanceSettings, FinanceStrip, Transactions, toCsv } from "./FinanceTab";

/** The finance parts as the project page composes them. */
function Page({ canEdit, settings = false }: { canEdit: boolean; settings?: boolean }) {
  return (
    <>
      <FinanceStrip projectId="p1" canEdit={canEdit} onSettings={() => {}} onRegister={() => {}} />
      <Transactions projectId="p1" canEdit={canEdit} adding={null} setAdding={() => {}} />
      <ContractSummary projectId="p1" canEdit={canEdit} onSettings={() => {}} />
      <FinanceSettings projectId="p1" open={settings} onOpenChange={() => {}} canEdit={canEdit} />
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

function fixture(): Finance {
  const ctrl = { ...DEFAULT_CTRL, contractValue: 10000000, version: 3, updatedAt: null };
  const entries: Finance["entries"] = [
    {
      id: "e1",
      date: "2026-03-02",
      description: "رواتب الفريق",
      cat: "salary",
      type: "expense",
      amount: 2000000,
      profitMargin: 0,
      profitMarginType: "pct",
      status: "paid",
      note: "",
      source: "manual",
    },
    {
      id: "e2",
      date: "2026-03-05",
      description: "قاعة",
      cat: "bdg_b1",
      type: "expense",
      amount: 500000,
      profitMargin: 0,
      profitMarginType: "pct",
      status: "",
      note: "",
      source: "agreement",
    },
  ];
  const budget = [{ id: "b1", name: "قاعة", amount: 500000, note: "", sort: 1 }];
  return { ctrl, entries, budget, categories: [], summary: summarize({ ctrl, entries, budget }) };
}

describe("FinanceTab", () => {
  it("shows v1 numbers, budget names instead of raw keys, and the missing-items warning", async () => {
    stubApi({ "GET /api/projects/p1/finance": () => fixture() });
    await renderWithApp(<Page canEdit />);
    expect((await screen.findAllByText("رواتب الفريق")).length).toBeGreaterThan(0);
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("قاعة").length).toBeGreaterThanOrEqual(2); // description + category label
    expect(screen.getByRole("status")).toHaveTextContent("لم تُسجَّل بعد: أتعاب التنفيذ");
    expect(screen.getAllByText(/115,000/).length).toBeGreaterThan(0); // gross = 100,000 + 15%
  });

  it("recalculates live while typing and saves once with the version it started from", async () => {
    const calls = stubApi({
      "GET /api/projects/p1/finance": () => fixture(),
      "PATCH /api/projects/p1/finance/ctrl": (_u, init) => {
        const body = JSON.parse(String(init.body));
        const f = fixture();
        return { ...f, ctrl: { ...f.ctrl, vatIncluded: true, version: body.version + 1 } };
      },
    });
    await renderWithApp(<Page canEdit settings />);
    await userEvent.click(await screen.findByLabelText("شامل الضريبة"));
    // the calculation trail updates before anything is saved: gross is now the typed 100,000
    expect(
      within(screen.getByLabelText("شريط الحساب")).getAllByText(/100,000/).length,
    ).toBeGreaterThan(0);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true), {
      timeout: 2000,
    });
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body).toEqual({ vatIncluded: true, version: 3 });
  });

  it("members see everything read-only, with no edit buttons", async () => {
    stubApi({ "GET /api/projects/p1/finance": () => fixture() });
    await renderWithApp(<Page canEdit={false} settings />);
    expect((await screen.findAllByText("للاطلاع فقط")).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText("قيمة العقد (ر.س)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /قيد جديد/ })).toBeNull();
    expect(screen.queryByText("تسجيلها الآن")).toBeNull();
  });

  it("exports a CSV that Excel opens in Arabic", () => {
    const f = fixture();
    const csv = toCsv(f, (c) => (c === "salary" ? "رواتب" : "قاعة"));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"رواتب الفريق","رواتب","مصروف","20000.00"');
  });
});

describe("FinanceStrip", () => {
  it("asks managers to set up the contract while finance still uses the defaults", async () => {
    const f = fixture();
    stubApi({ "GET /api/projects/p1/finance": () => ({ ...f, ctrl: { ...f.ctrl, version: 0 } }) });
    await renderWithApp(<Page canEdit />);
    expect(await screen.findByRole("button", { name: /إعداد العقد/ })).toBeInTheDocument();
  });

  it("shows the contract breakdown down to what is left for execution", async () => {
    stubApi({ "GET /api/projects/p1/finance": () => fixture() });
    await renderWithApp(<Page canEdit />);
    const summary = (await screen.findByText("ملخص العقد")).closest("div")
      ?.parentElement as HTMLElement;
    expect(within(summary).getByText("المتاح للتنفيذ")).toBeInTheDocument();
    expect(within(summary).getByText("المتبقي للتنفيذ")).toBeInTheDocument();
  });
});
