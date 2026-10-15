import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDay } from "./features/workspace/api";
import { Home } from "./home";
import { meUser, renderWithApp, stubApi } from "./test-utils";

afterEach(() => vi.unstubAllGlobals());

const t = localDay();
const routes = (role = "owner", extra: object = {}) => ({
  "GET /api/me": () => ({
    ok: true,
    user: meUser(role, { id: "u1", name: "سلطان المطيري", ...extra }),
  }),
  "GET /api/attention": () => ({ ok: true, items: [], checklist: [] }),
  "GET /api/tasks": () => ({
    ok: true,
    items: [
      { id: "t1", title: "مهمة متأخرة", status: "todo", dueDate: "2020-01-01", projectName: "" },
      { id: "t2", title: "مهمة اليوم", status: "doing", dueDate: t, projectName: "ملتقى" },
      { id: "t3", title: "منجزة", status: "done", dueDate: t },
    ],
  }),
  "GET /api/meetings": () => ({
    ok: true,
    items: [
      {
        id: "m1",
        title: "مراجعة الخطة",
        startsAt: `${t}T10:30`,
        durationMin: 60,
        location: "القاعة",
        attendees: [],
        clientName: "",
        requestName: "",
        projectName: "",
        status: "scheduled",
      },
    ],
  }),
  "GET /api/decisions": () => ({
    ok: true,
    items: [
      {
        id: "d1",
        title: "اعتماد الميزانية",
        ownerId: "u1",
        ownerName: "سلطان",
        dueDate: "",
        status: "open",
        meetingId: "",
        meetingTitle: "",
        taskId: "",
        details: "",
      },
    ],
  }),
  "GET /api/crm/followups": () => ({
    ok: true,
    today: t,
    items: [
      {
        kind: "request",
        id: "r1",
        title: "منى",
        subtitle: "جمعية الأمل",
        phone: "",
        date: "2020-01-01",
        ownerId: "u1",
        ownerName: "",
        link: "",
        value: 5000,
        state: "overdue",
      },
    ],
  }),
  "GET /api/sales/overview": () => ({
    ok: true,
    pipeline: { stages: [], open: { count: 3, value: 90000, weighted: 30000 } },
    results: { won: 1, lost: 1, winRate: 50, avgCycleDays: null, wonThisQuarter: 12000 },
  }),
  "GET /api/projects": () => ({
    items: [
      { id: "p1", name: "برنامج", clientName: "الأفق", status: "active", contractTotal: 150000 },
    ],
    counts: { active: 1 },
  }),
});

describe("Home «اليوم»", () => {
  it("greets, and shows my tasks by urgency, my meetings, my decisions and who to call", async () => {
    stubApi(routes());
    await renderWithApp(<Home />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("سلطان"),
    );
    const tasks = within(await screen.findByLabelText("مهامي"));
    expect(await tasks.findByText("مهمة متأخرة")).toBeInTheDocument();
    expect(tasks.getByText(/^متأخرة/)).toBeInTheDocument();
    expect(tasks.getByText("مهمة اليوم")).toBeInTheDocument();
    expect(tasks.queryByText("منجزة")).toBeNull();
    const meetings = within(screen.getByLabelText("اجتماعاتي"));
    expect(await meetings.findByText("مراجعة الخطة")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("قرارات عليّ تنفيذها")).getByText("اعتماد الميزانية"),
    ).toBeInTheDocument();
    const calls = within(screen.getByLabelText("من أتابع اليوم"));
    expect(await calls.findByRole("link", { name: /جمعية الأمل/ })).toHaveAttribute(
      "href",
      "/sales/r1",
    );
    expect(screen.getByText(/1,500\.00|١٬٥٠٠/)).toBeInTheDocument(); // active contracts' value
  });

  it("ticks a task done from the home page", async () => {
    const calls = stubApi({ ...routes(), "PATCH /api/tasks/t2": () => ({ ok: true }) });
    await renderWithApp(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "إنجاز مهمة اليوم" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "done" }),
    );
  });

  it("someone who only sees projects gets no sales, meetings, tasks or follow-up cards", async () => {
    stubApi(routes("owner", { perms: ["projects.view"] }));
    await renderWithApp(<Home />);
    await screen.findByLabelText("المشاريع");
    expect(screen.queryByLabelText("المبيعات")).toBeNull();
    expect(screen.queryByLabelText("اجتماعاتي")).toBeNull();
    expect(screen.queryByLabelText("مهامي")).toBeNull();
    expect(screen.queryByLabelText("من أتابع اليوم")).toBeNull();
  });
});
