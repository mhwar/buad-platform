import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { FollowupsPage } from "../sales/FollowupsPage";
import { ClientCrm } from "./ClientCrm";

afterEach(() => vi.unstubAllGlobals());

const crm = (extra: object = {}) => ({
  ok: true,
  relationship: "prospect",
  crm: {
    ownerId: "u2",
    ownerName: "نورة",
    source: "referral",
    tags: ["مهم"],
    nextFollowUpAt: "2020-01-01",
    lastContactAt: Math.floor(Date.now() / 1000) - 86400 * 3,
  },
  activities: [
    {
      id: "a1",
      type: "call",
      summary: "اتصلنا لتعريفه",
      at: Math.floor(Date.now() / 1000) - 86400 * 3,
      createdByName: "سلطان",
      requestId: "",
    },
  ],
  ...extra,
});
const base = (role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/tasks/assignees": () => ({
    ok: true,
    users: [{ id: "u2", name: "نورة", email: "n@a.sa" }],
  }),
  "GET /api/crm/clients/c1": () => crm(),
});

describe("ClientCrm", () => {
  it("shows the derived relationship, last contact, an overdue follow-up and the log", async () => {
    stubApi(base());
    await renderWithApp(<ClientCrm clientId="c1" />);
    expect(await screen.findByText("محتمل")).toBeInTheDocument();
    expect(screen.getByText("اتصلنا لتعريفه")).toBeInTheDocument();
    expect(screen.getByText(/متأخرة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إزالة الوسم مهم" })).toBeInTheDocument();
    expect(screen.getByLabelText("المسؤول")).toHaveValue("u2");
  });

  it("logs a contact with the type chosen and a follow-up date from a shortcut", async () => {
    const calls = stubApi({
      ...base(),
      "POST /api/crm/clients/c1/activities": () => [201, { ok: true, id: "a2" }],
    });
    await renderWithApp(<ClientCrm clientId="c1" />);
    await userEvent.click(await screen.findByRole("radio", { name: /اجتماع/ }));
    await userEvent.type(screen.getByLabelText("ما دار في التواصل"), "اتفقنا على زيارة");
    await userEvent.click(screen.getByRole("button", { name: "بعد أسبوع" }));
    await userEvent.click(screen.getByRole("button", { name: "حفظ التواصل" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const body = calls.find((c) => c.method === "POST")?.body as Record<string, string>;
    expect(body).toMatchObject({ type: "meeting", summary: "اتفقنا على زيارة" });
    expect(body.followUpAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("adds and removes tags, and sets the owner", async () => {
    const calls = stubApi({ ...base(), "PATCH /api/crm/clients/c1": () => ({ ok: true }) });
    await renderWithApp(<ClientCrm clientId="c1" />);
    await userEvent.type(await screen.findByLabelText("وسم جديد"), "جمعية{Enter}");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ tags: ["مهم", "جمعية"] }),
    );
    await userEvent.click(screen.getByRole("button", { name: "إزالة الوسم مهم" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ tags: [] }),
    );
  });

  it("a reader sees the card without the form or the controls", async () => {
    stubApi(base("viewer"));
    await renderWithApp(<ClientCrm clientId="c1" />);
    await screen.findByText("اتصلنا لتعريفه");
    expect(screen.queryByRole("button", { name: "حفظ التواصل" })).toBeNull();
    expect(screen.queryByLabelText("وسم جديد")).toBeNull();
    expect(screen.getByLabelText("المسؤول")).toBeDisabled();
  });
});

describe("FollowupsPage", () => {
  const item = (o: object) => ({
    kind: "client",
    id: "c1",
    title: "جمعية الأمل",
    subtitle: "",
    phone: "0551234567",
    date: "2026-03-01",
    ownerId: "u2",
    ownerName: "نورة",
    link: "/clients/c1",
    value: 0,
    state: "overdue",
    ...o,
  });
  const routes = (items: object[]) => ({
    "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
    "GET /api/crm/followups": () => ({ ok: true, today: "2026-03-10", items }),
  });

  it("groups by urgency, overdue first, and says what each is", async () => {
    stubApi(
      routes([
        item({}),
        item({ id: "r1", kind: "request", title: "منى", state: "today", value: 40000 }),
        item({ id: "r2", kind: "request", title: "خالد", state: "later" }),
      ]),
    );
    await renderWithApp(<FollowupsPage />);
    const groups = (await screen.findAllByRole("region")).map((r) => r.getAttribute("aria-label"));
    expect(groups).toEqual(["متأخرة", "اليوم", "لاحقاً"]);
    expect(
      within(screen.getByRole("region", { name: "اليوم" })).getByText("فرصة"),
    ).toBeInTheDocument();
  });

  it("moves a follow-up by a day, clears it when done, on the right kind of record", async () => {
    const calls = stubApi({
      ...routes([item({}), item({ id: "r1", kind: "request", title: "منى", state: "today" })]),
      "PATCH /api/crm/clients/c1": () => ({ ok: true }),
      "PATCH /api/product-requests/r1": () => ({ ok: true }),
    });
    await renderWithApp(<FollowupsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "تمّت متابعة جمعية الأمل" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/crm/clients/c1")?.body).toEqual({
        nextFollowUpAt: "",
      }),
    );
    const tomorrow = within(screen.getByRole("region", { name: "اليوم" })).getByRole("button", {
      name: "غداً",
    });
    await userEvent.click(tomorrow);
    await waitFor(() =>
      expect(
        (calls.find((c) => c.path === "/api/product-requests/r1")?.body as { followUpAt: string })
          .followUpAt,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("explains an empty list", async () => {
    stubApi(routes([]));
    await renderWithApp(<FollowupsPage />);
    expect(await screen.findByText("لا متابعات مجدولة")).toBeInTheDocument();
  });
});
