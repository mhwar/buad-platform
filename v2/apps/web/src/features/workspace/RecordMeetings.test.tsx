import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { addDaysLocal } from "./api";
import { RecordMeetings } from "./RecordMeetings";

afterEach(() => vi.unstubAllGlobals());

const m = (id: string, title: string, startsAt: string, status = "scheduled") => ({
  id,
  title,
  startsAt,
  durationMin: 60,
  location: "",
  attendees: [],
  clientId: "c1",
  clientName: "",
  requestId: "",
  requestName: "",
  projectId: "",
  projectName: "",
  agenda: "",
  minutes: "",
  status,
  createdBy: "u1",
  createdByName: "",
  createdAt: 1,
  updatedAt: 1,
});

const routes = (role: string, extra: Record<string, unknown> = {}) => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role, extra) }),
  "GET /api/meetings": (u: URL) => ({
    ok: true,
    items:
      u.searchParams.get("clientId") === "c1"
        ? [
            m("a", "مراجعة العرض", `${addDaysLocal(3)}T10:00`),
            m("b", "تعارف", "2020-01-01T09:00", "done"),
          ]
        : [],
  }),
  "GET /api/tasks/assignees": () => ({ ok: true, users: [] }),
});

describe("RecordMeetings", () => {
  it("lists the record's coming and past meetings and plans one already linked to it", async () => {
    const calls = stubApi(routes("owner"));
    await renderWithApp(<RecordMeetings link={{ clientId: "c1" }} title="اجتماع مع الأمل" />);
    const card = await screen.findByLabelText("الاجتماعات");
    expect(await within(card).findByText("مراجعة العرض")).toBeInTheDocument();
    expect(within(card).getByText("قادم")).toBeInTheDocument();
    expect(within(card).getByText("عُقد")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/meetings")).toBe(true);
    await userEvent.click(within(card).getByRole("button", { name: "اجتماع" }));
    expect(await screen.findByDisplayValue("اجتماع مع الأمل")).toBeInTheDocument();
  });

  it("is hidden from those who cannot see meetings", async () => {
    const calls = stubApi(routes("owner", { perms: ["clients.view"] }));
    await renderWithApp(<RecordMeetings link={{ clientId: "c1" }} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText("الاجتماعات")).toBeNull();
    expect(calls.some((c) => c.path === "/api/meetings")).toBe(false);
  });
});
