import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { ClientDialog } from "./ClientDialog";

afterEach(() => vi.unstubAllGlobals());
const open = () => renderWithApp(<ClientDialog open onOpenChange={() => {}} />);

describe("ClientDialog", () => {
  it("requires the client name and sends nothing without it", async () => {
    const calls = stubApi({});
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "حفظ العميل" }));
    expect(await screen.findByText("هذا الحقل مطلوب")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
  });

  it("explains a duplicate CR number and links to the existing client", async () => {
    stubApi({
      "GET /api/clients/check-duplicate": () => ({ duplicate: null, similar: null }),
      "POST /api/clients": () => [
        409,
        {
          ok: false,
          error: "duplicate",
          duplicate: { id: "c9", code: "CL-0009", name: "الأفق", field: "regNo" },
        },
      ],
    });
    await open();
    await userEvent.type(await screen.findByLabelText("اسم العميل *"), "شركة جديدة");
    await userEvent.type(screen.getByLabelText("رقم السجل / الترخيص"), "1010");
    await userEvent.click(screen.getByRole("button", { name: "حفظ العميل" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("رقم السجل مسجّل للعميل");
    expect(screen.getByRole("link", { name: "الأفق (CL-0009)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حفظ العميل" })).toBeDisabled();
  });

  it("asks before saving a similar name, then resends with confirmation", async () => {
    let attempt = 0;
    const calls = stubApi({
      "POST /api/clients": () =>
        ++attempt === 1
          ? [
              409,
              {
                ok: false,
                error: "similar_name",
                similar: { id: "c1", code: "CL-0001", name: "مؤسسة الأمل" },
              },
            ]
          : [201, { ok: true, id: "c2", code: "CL-0002" }],
    });
    await open();
    await userEvent.type(await screen.findByLabelText("اسم العميل *"), "مؤسسه الامل");
    await userEvent.click(screen.getByRole("button", { name: "حفظ العميل" }));
    await userEvent.click(await screen.findByRole("button", { name: /نعم، عميل مختلف/ }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));
    const posts = calls
      .filter((c) => c.method === "POST")
      .map((c) => (c.body as { confirmSimilarName: boolean }).confirmSimilarName);
    expect(posts).toEqual([false, true]);
  });
});
