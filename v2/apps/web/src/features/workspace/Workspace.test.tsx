import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, stubApi } from "../../test-utils";
import { addDaysLocal, localDay } from "./api";
import { DecisionsPage } from "./DecisionsPage";
import { MeetingsPage } from "./MeetingsPage";

afterEach(() => vi.unstubAllGlobals());

async function open(path: string, at: string, Page: ComponentType) {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: at,
    validateSearch: (s: Record<string, unknown>) => s as Record<string, string>,
    component: Page,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );
}

const t = localDay();
const meeting = (o: object = {}) => ({
  id: "m1",
  title: "مراجعة الخطة",
  startsAt: `${t}T10:30`,
  durationMin: 60,
  location: "القاعة",
  attendees: [{ id: "u2", name: "نورة" }],
  clientId: "",
  clientName: "",
  requestId: "r1",
  requestName: "جمعية الأمل",
  projectId: "",
  projectName: "",
  agenda: "الميزانية\nالجدول",
  minutes: "",
  status: "scheduled",
  createdBy: "u1",
  createdByName: "",
  openDecisions: 1,
  createdAt: 1,
  updatedAt: 1,
  ...o,
});
const decision = (o: object = {}) => ({
  id: "d1",
  title: "اعتماد الميزانية",
  details: "",
  ownerId: "u1",
  ownerName: "سلطان",
  dueDate: "2020-01-01",
  status: "open",
  meetingId: "m1",
  meetingTitle: "مراجعة الخطة",
  projectId: "",
  taskId: "",
  createdAt: 1,
  updatedAt: 1,
  ...o,
});
const base = (role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/tasks/assignees": () => ({ ok: true, users: [{ id: "u2", name: "نورة", email: "" }] }),
});

describe("meetings", () => {
  it("groups the coming ones by day, today first, with their links and open decisions", async () => {
    stubApi({
      ...base(),
      "GET /api/meetings": () => ({
        ok: true,
        items: [
          meeting(),
          meeting({
            id: "m2",
            title: "لقاء العميل",
            startsAt: `${addDaysLocal(1)}T09:00`,
            openDecisions: 0,
          }),
        ],
      }),
    });
    await open("/meetings", "/meetings", MeetingsPage);
    const today = within(await screen.findByRole("region", { name: "اليوم" }));
    expect(today.getByText("مراجعة الخطة")).toBeInTheDocument();
    expect(today.getByText("فرصة: جمعية الأمل")).toBeInTheDocument();
    expect(today.getByText("1 قرار مفتوح")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "غداً" })).getByText("لقاء العميل"),
    ).toBeInTheDocument();
  });

  it("opens a meeting: agenda, minutes, decisions — and closes it as held with the minutes", async () => {
    const calls = stubApi({
      ...base(),
      "GET /api/meetings": () => ({ ok: true, items: [meeting()] }),
      "GET /api/meetings/m1": () => ({ ok: true, meeting: meeting(), decisions: [decision()] }),
      "PATCH /api/meetings/m1": () => ({ ok: true }),
    });
    await open("/meetings?open=m1", "/meetings", MeetingsPage);
    const dlg = within(await screen.findByRole("dialog"));
    expect(await dlg.findByText("الميزانية")).toBeInTheDocument();
    expect(dlg.getByText("اعتماد الميزانية")).toBeInTheDocument();
    expect(dlg.getByRole("link", { name: /جمعية الأمل/ })).toHaveAttribute("href", "/sales/r1");
    await userEvent.type(dlg.getByLabelText("المحضر"), "اتفقنا");
    await userEvent.click(dlg.getByRole("button", { name: /عُقد/ }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PATCH" && (c.body as { status?: string }).status)?.body,
      ).toEqual({
        status: "done",
        minutes: "اتفقنا",
      }),
    );
  });
});

describe("decisions", () => {
  const items = [
    decision(),
    decision({
      id: "d2",
      title: "حجز القاعة",
      ownerId: "u2",
      ownerName: "نورة",
      dueDate: "",
      meetingId: "",
      meetingTitle: "",
    }),
    decision({ id: "d3", title: "قرار قديم", status: "done" }),
  ];
  it("lists the open ones, with mine, late and finished a tap away", async () => {
    stubApi({ ...base(), "GET /api/decisions": () => ({ ok: true, items }) });
    await open("/decisions", "/decisions", DecisionsPage);
    expect(await screen.findByText("اعتماد الميزانية")).toBeInTheDocument();
    expect(screen.getByText("حجز القاعة")).toBeInTheDocument();
    expect(screen.queryByText("قرار قديم")).toBeNull();
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual([
      "المفتوحة2",
      "المسندة إليّ1",
      "المتأخرة1",
      "المنتهية1",
    ]);
    expect(screen.getByText(/متأخر ·/)).toBeInTheDocument();
  });

  it("turns a decision into a task, and marks one done", async () => {
    const calls = stubApi({
      ...base(),
      "GET /api/decisions": () => ({ ok: true, items }),
      "POST /api/decisions/d1/task": () => ({ ok: true, taskId: "t1" }),
      "PATCH /api/decisions/d2": () => ({ ok: true }),
    });
    await open("/decisions", "/decisions", DecisionsPage);
    await userEvent.click((await screen.findAllByRole("button", { name: /تحويل إلى مهمة/ }))[0]!);
    await userEvent.click(screen.getByRole("button", { name: "تم تنفيذ حجز القاعة" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/decisions/d1/task")).toBe(
        true,
      );
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "done" });
    });
  });

  it("a viewer reads without acting", async () => {
    stubApi({ ...base("viewer"), "GET /api/decisions": () => ({ ok: true, items }) });
    await open("/decisions", "/decisions", DecisionsPage);
    await screen.findByText("اعتماد الميزانية");
    expect(screen.queryByRole("button", { name: /تحويل إلى مهمة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^قرار$/ })).toBeNull();
  });
});
