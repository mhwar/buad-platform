import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { ProjectDialog } from "./ProjectDialog";

afterEach(() => vi.unstubAllGlobals());

describe("ProjectDialog", () => {
  it("from a client page: the client is fixed and the picker hidden (as in v1)", async () => {
    const calls = stubApi({
      "POST /api/projects": () => [201, { ok: true, id: "p1", number: "PRJ-2026-0001" }],
    });
    await renderWithApp(<ProjectDialog open onOpenChange={() => {}} clientId="c7" />);
    expect(screen.queryByLabelText("العميل *")).toBeNull();
    await userEvent.type(await screen.findByLabelText("اسم المشروع *"), "برنامج قيادي");
    await userEvent.clear(screen.getByLabelText("قيمة العقد المتوقعة (ر.س)"));
    await userEvent.type(screen.getByLabelText("قيمة العقد المتوقعة (ر.س)"), "1500.5");
    await userEvent.click(screen.getByRole("button", { name: "حفظ المشروع" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      clientId: "c7",
      name: "برنامج قيادي",
      expectedValue: 1500.5,
      status: "active",
    });
  });

  it("from the projects list: asks for the client and blocks an end date before the start", async () => {
    const calls = stubApi({
      "GET /api/clients": () => ({
        items: [{ id: "c1", code: "CL-0001", name: "الأفق" }],
        counts: {},
      }),
    });
    await renderWithApp(<ProjectDialog open onOpenChange={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "حفظ المشروع" }));
    expect((await screen.findAllByText("هذا الحقل مطلوب")).length).toBeGreaterThanOrEqual(2);
    await screen.findByRole("option", { name: "الأفق (CL-0001)" });
    await userEvent.selectOptions(screen.getByLabelText("العميل *"), "c1");
    await userEvent.type(screen.getByLabelText("اسم المشروع *"), "س");
    const start = screen.getByLabelText("تاريخ البداية");
    await userEvent.clear(start);
    await userEvent.type(start, "2026-05-10");
    await userEvent.type(screen.getByLabelText("تاريخ الانتهاء المتوقع"), "2026-05-01");
    await userEvent.click(screen.getByRole("button", { name: "حفظ المشروع" }));
    expect(await screen.findByText("تاريخ الانتهاء قبل تاريخ البداية")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });
});
