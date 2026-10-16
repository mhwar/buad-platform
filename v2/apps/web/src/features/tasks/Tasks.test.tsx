import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ExecutionTab } from "./ExecutionTab";
import { hours, isOverdue } from "./queries";
import { TasksPage } from "./TasksPage";

afterEach(() => vi.unstubAllGlobals());

const task = (o: object = {}) => ({
  id: "t1",
  projectId: "p1",
  stageId: "",
  title: "جهّز العرض",
  description: "",
  assigneeId: "u2",
  assigneeName: "نورة",
  projectName: "مشروع النور",
  status: "doing",
  priority: "high",
  startDate: "",
  dueDate: "2020-01-01",
  doneAt: 0,
  ...o,
});

describe("task helpers", () => {
  it("knows what is overdue and formats hours", () => {
    expect(isOverdue({ status: "todo", dueDate: "2020-01-01" })).toBe(true);
    expect(isOverdue({ status: "done", dueDate: "2020-01-01" })).toBe(false);
    expect(isOverdue({ status: "todo", dueDate: "" })).toBe(false);
    expect(hours(90)).toBe("1 س 30 د");
    expect(hours(120)).toBe("2 س");
    expect(hours(25)).toBe("25 د");
  });
});

describe("TasksPage", () => {
  const base = (role = "member") => ({
    "GET /api/me": () => ({ ok: true, user: meUser(role) }),
    "GET /api/tasks": () => ({
      ok: true,
      items: [task(), task({ id: "t2", title: "منجزة قديمة", status: "done" })],
    }),
    "GET /api/tasks/assignees": () => ({
      ok: true,
      users: [{ id: "u2", name: "نورة", email: "n@a.sa" }],
    }),
  });

  it("shows my open tasks with the overdue mark and counts per view", async () => {
    stubApi(base());
    await renderWithApp(<TasksPage />);
    expect(await screen.findByText("جهّز العرض")).toBeInTheDocument();
    expect(screen.getByText(/متأخرة · 2020-01-01/)).toBeInTheDocument();
    expect(screen.queryByText("منجزة قديمة")).toBeNull();
    expect(screen.getByRole("tab", { name: "متأخرة (1)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "منجزة (1)" }));
    expect(screen.getByText("منجزة قديمة")).toBeInTheDocument();
  });

  it("changes a status from the row", async () => {
    const calls = stubApi({ ...base(), "PATCH /api/tasks/t1": () => ({ ok: true }) });
    await renderWithApp(<TasksPage />);
    await userEvent.selectOptions(await screen.findByLabelText("حالة جهّز العرض"), "done");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "done" }),
    );
  });

  it("a viewer reads without edit controls", async () => {
    stubApi(base("viewer"));
    await renderWithApp(<TasksPage />);
    await screen.findByText("جهّز العرض");
    expect(screen.queryByRole("button", { name: "مهمة جديدة" })).toBeNull();
    expect(screen.queryByLabelText("حالة جهّز العرض")).toBeNull();
  });

  it("shows a board by status, with done tasks in their own column", async () => {
    stubApi(base());
    const { router } = await renderWithApp(<TasksPage />);
    await screen.findByText("جهّز العرض");
    await userEvent.click(screen.getByRole("tab", { name: "لوحة" }));
    const board = await screen.findByRole("list", { name: "المهام حسب الحالة" });
    expect(within(board).getByRole("listitem", { name: "قيد التنفيذ" })).toHaveTextContent(
      "جهّز العرض",
    );
    expect(within(board).getByRole("listitem", { name: "منجزة" })).toHaveTextContent("منجزة قديمة");
    expect(router.state.location.search).toMatchObject({ layout: "board" });
  });

  it("filters by text and project, and lays the result out as a table", async () => {
    stubApi({
      ...base(),
      "GET /api/tasks": () => ({
        ok: true,
        items: [
          task(),
          task({ id: "t3", title: "اطبع الشهادات", projectId: "p2", projectName: "ملتقى" }),
        ],
      }),
    });
    const { router } = await renderWithApp(<TasksPage />);
    await screen.findByText("اطبع الشهادات");
    await userEvent.selectOptions(screen.getByLabelText("المشروع"), "p2");
    expect(screen.queryByText("جهّز العرض")).toBeNull();
    expect(router.state.location.search).toMatchObject({ project: "p2" });
    await userEvent.click(screen.getByRole("tab", { name: "جدول" }));
    expect(screen.getByRole("table")).toHaveTextContent("اطبع الشهادات");
    await userEvent.type(screen.getByPlaceholderText(/ابحث في المهام/), "لا يوجد");
    expect(await screen.findByText("لا مهام تطابق البحث")).toBeInTheDocument();
  });
});

describe("ExecutionTab", () => {
  const exec = (stages: object[], hasService = true) => ({
    "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
    "GET /api/tasks/assignees": () => ({ ok: true, users: [] }),
    "GET /api/tasks/projects/p1": () => ({
      ok: true,
      stages,
      tasks: [task()],
      minutes: 150,
      hasService,
    }),
  });

  it("offers to generate stages from the linked service, and shows hours", async () => {
    const calls = stubApi({
      ...exec([]),
      "POST /api/tasks/projects/p1/stages/from-service": () => [201, { ok: true, count: 3 }],
    });
    await renderWithApp(<ExecutionTab projectId="p1" />);
    expect(await screen.findByText(/الوقت المسجّل: 2 س 30 د/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /توليد من آلية عمل الخدمة/ }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/from-service"))).toBe(true));
  });

  it("moves a stage along and adds a new one", async () => {
    const stage = {
      id: "s1",
      title: "التخطيط",
      status: "todo",
      dueDate: "",
      sort: 1,
      source: "manual",
    };
    const calls = stubApi({
      ...exec([stage]),
      "PATCH /api/tasks/stages/s1": () => ({ ok: true }),
      "POST /api/tasks/projects/p1/stages": () => [201, { ok: true, id: "s2" }],
    });
    await renderWithApp(<ExecutionTab projectId="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: /التخطيط: لم تبدأ/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "doing" }),
    );
    expect(screen.queryByRole("button", { name: /توليد/ })).toBeNull(); // only when there are no stages
    await userEvent.type(screen.getByLabelText("مرحلة جديدة"), "التسليم");
    await userEvent.click(screen.getByRole("button", { name: "إضافة" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(
      within(screen.getByRole("region", { name: "مهام المشروع" })).getByText("جهّز العرض"),
    ).toBeInTheDocument();
  });
});
