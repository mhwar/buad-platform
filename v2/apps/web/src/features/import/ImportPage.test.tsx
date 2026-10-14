import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { ImportPage } from "./ImportPage";

afterEach(() => vi.unstubAllGlobals());
const ws = JSON.parse(
  readFileSync(join(__dirname, "../../../../../tools/migrate/fixtures/v1-workspace.json"), "utf8"),
);
const backupFile = () =>
  new File(
    [
      JSON.stringify({
        buad2_clients: JSON.stringify(ws.clients),
        buad2_projects: JSON.stringify(ws.projects),
        buad2_fin_p1: JSON.stringify(ws.fin.p1),
      }),
    ],
    "buad_backup.json",
    {
      type: "application/json",
    },
  );

describe("ImportPage", () => {
  it("previews the v1 file, pre-selects suggested clients, and sends only the chosen ones", async () => {
    const calls = stubApi({
      "GET /api/clients": () => ({ items: [], counts: {} }),
      "POST /api/import/v1": () => ({
        ok: true,
        clients: { created: 1, updated: 0 },
        projects: { created: 3, updated: 0 },
        issues: [],
      }),
    });
    await renderWithApp(<ImportPage />);
    await userEvent.upload(screen.getByLabelText(/اختاروا ملف التصدير/), backupFile());
    expect(await screen.findByText("buad_backup.json")).toBeInTheDocument();
    expect(screen.getAllByText("مقترح").length).toBeGreaterThan(0);
    expect(screen.queryByText("c5")).toBeNull(); // nameless client hidden
    await userEvent.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(screen.getByRole("button", { name: "استيراد المحدد" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/شركة الأفق/));
    await userEvent.click(screen.getByRole("button", { name: "استيراد المحدد" }));
    expect(await screen.findByText("تم الاستيراد")).toBeInTheDocument();
    const sent = calls.find((c) => c.method === "POST")?.body as {
      clients: { id: string }[];
      projects: { client_id: string }[];
    };
    expect(sent.clients.map((c) => c.id)).toEqual(["c1"]);
    expect(new Set(sent.projects.map((p) => p.client_id))).toEqual(new Set(["c1"]));
  });

  it("refuses a file that is not a v1 export, sending nothing", async () => {
    const calls = stubApi({ "GET /api/clients": () => ({ items: [], counts: {} }) });
    await renderWithApp(<ImportPage />);
    await userEvent.upload(
      screen.getByLabelText(/اختاروا ملف التصدير/),
      new File(['{"x":1}'], "x.json", { type: "application/json" }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ليس ملف تصدير"));
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });
});

describe("company finance in the chosen file", () => {
  const fileWith = (extra: Record<string, string>) =>
    new File(
      [
        JSON.stringify({
          buad2_clients: JSON.stringify(ws.clients),
          buad2_projects: JSON.stringify(ws.projects),
          ...extra,
        }),
      ],
      "buad_backup.json",
      { type: "application/json" },
    );
  const pick = async (f: File) => {
    stubApi({ "GET /api/clients": () => ({ items: [], counts: {} }) });
    await renderWithApp(<ImportPage />);
    await userEvent.upload(screen.getByLabelText(/اختاروا ملف التصدير/), f);
  };

  it("says when the file has none, with the steps to export it", async () => {
    await pick(fileWith({}));
    expect(await screen.findByText(/غير موجودة في هذا الملف/)).toBeInTheDocument();
    expect(screen.getByText(/سجّلوا الخروج ثم الدخول/)).toBeInTheDocument();
  });

  it("tells v1 sync leftovers apart", async () => {
    await pick(
      fileWith({
        buad2_pf: JSON.stringify({
          income: [{ id: "a", category: "project_fee", amount: 9, desc: "x" }],
        }),
      }),
    );
    expect(await screen.findByText(/قيد مزامنة قديم/)).toBeInTheDocument();
  });

  it("shows what will come along when it is there", async () => {
    await pick(
      fileWith({
        buad2_pf: JSON.stringify({
          income: [{ id: "a", category: "consulting", amount: 100, desc: "x" }],
          partners: [{ id: "p", name: "أ", share_pct: 100 }],
          distributions: [],
        }),
      }),
    );
    expect(await screen.findByText(/مالية الشركة في الملف:/)).toBeInTheDocument();
    expect(screen.getByText(/1 شريك/)).toBeInTheDocument();
  });
});
