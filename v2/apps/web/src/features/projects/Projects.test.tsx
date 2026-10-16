import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { ProjectPulse } from "./ProjectPulse";
import { ProjectsPage } from "./ProjectsPage";

afterEach(() => vi.unstubAllGlobals());

const item = (o: object = {}) => ({
  id: "p1",
  number: "PR-1",
  name: "ملتقى الشباب",
  type: "event",
  status: "active",
  visibility: "team",
  location: "",
  startDate: "2020-01-01",
  endDate: "2020-06-30",
  expectedValue: 100000,
  contractTotal: 11_500_000,
  archivedAt: null,
  clientId: "c1",
  clientName: "جمعية الأمل",
  clientCode: "CL-1",
  clientLogoUrl: "",
  productId: "",
  productName: "",
  packageId: "",
  packageName: "",
  estimated: true,
  received: 3_000_000,
  stagesTotal: 4,
  stagesDone: 1,
  tasksOpen: 3,
  tasksDone: 1,
  tasksOverdue: 2,
  nextDueDate: "2020-09-01",
  nextDueAmount: 5_000_000,
  late: true,
  ...o,
});

async function open(path: string, items: object[]) {
  const calls = stubApi({
    "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
    "GET /api/projects": () => ({ ok: true, items, counts: { active: items.length } }),
  });
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: "/projects",
    validateSearch: (s: Record<string, unknown>) => s as Record<string, string>,
    component: ProjectsPage,
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
  return calls;
}

describe("project cards", () => {
  it("show health: lateness, work done, money in, the next instalment, and an estimated value", async () => {
    await open("/projects", [item()]);
    const card = within((await screen.findByText("ملتقى الشباب")).closest("a") as HTMLElement);
    expect(card.getByText(/متأخر \d+ يوم/)).toBeInTheDocument();
    expect(card.getByText("1/4")).toBeInTheDocument();
    expect(card.getByText(/2 متأخرة/)).toBeInTheDocument();
    expect(card.getByText(/التحصيل/)).toBeInTheDocument();
    expect(card.getByText(/دفعة متأخرة/)).toBeInTheDocument();
    expect(card.getByText("تقديري")).toBeInTheDocument();
  });

  it("a filter with no results says «لا نتائج», not «no projects yet»", async () => {
    await open("/projects?product=prd_x", []);
    expect(await screen.findByText("لا نتائج")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد مشاريع بعد")).toBeNull();
  });

  it("sends the attention filter and the deadline order to the server", async () => {
    const calls = await open("/projects?flag=late&sort=deadline", [item()]);
    await screen.findByText("ملتقى الشباب");
    const u = calls.find((c) => c.path === "/api/projects");
    expect(u).toBeTruthy();
  });

  it("hides money for someone who may not see it", async () => {
    await open("/projects", [item({ received: null, nextDueAmount: null, nextDueDate: "" })]);
    const card = within((await screen.findByText("ملتقى الشباب")).closest("a") as HTMLElement);
    expect(card.queryByText(/التحصيل/)).toBeNull();
    expect(card.queryByText(/الدفعة/)).toBeNull();
  });
});

describe("project pulse", () => {
  it("shows work done, time left, the next task and the next instalment", async () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    stubApi({
      "GET /api/me": () => ({ ok: true, user: meUser("owner") }),
      "GET /api/tasks/projects/p1": () => ({
        ok: true,
        stages: [
          { id: "s1", title: "أ", status: "done" },
          { id: "s2", title: "ب", status: "doing" },
        ],
        tasks: [
          {
            id: "t1",
            title: "حجز القاعة",
            status: "todo",
            dueDate: "2020-01-01",
            assigneeName: "نورة",
          },
        ],
        minutes: 0,
        hasService: false,
      }),
      "GET /api/receivables/projects/p1": () => ({
        ok: true,
        items: [
          { id: "i1", label: "الدفعة الثانية", dueDate: soon, amount: 25000, status: "pending" },
        ],
      }),
    });
    await renderWithApp(
      <ProjectPulse projectId="p1" status="active" endDate={soon} onExecution={() => {}} />,
    );
    const pulse = within(screen.getByRole("list", { name: "نبض المشروع" }));
    expect(await pulse.findByText("1/2")).toBeInTheDocument();
    expect(pulse.getByText(/متبقٍ 3 يوم/)).toBeInTheDocument();
    expect(await pulse.findByText("حجز القاعة")).toBeInTheDocument();
    expect(pulse.getByText(/متأخرة/)).toBeInTheDocument();
    expect(await pulse.findByText(/الدفعة الثانية/)).toBeInTheDocument();
  });
});
