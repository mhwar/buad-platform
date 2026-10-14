import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { PlansPage } from "./PlansPage";

afterEach(() => vi.unstubAllGlobals());

const cycle = {
  id: "c1",
  kind: "operational",
  name: "الخطة التشغيلية 2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  vision: "",
  mission: "",
  values: [],
  parentCycleId: "",
  status: "active",
  version: 1,
};
const objective = {
  id: "o1",
  cycleId: "c1",
  parentId: "",
  title: "رفع رضا العملاء",
  description: "",
  ownerId: "u2",
  quarter: 2,
  weight: 1,
  budget: 5000,
  indicators: [
    {
      id: "i1",
      name: "نسبة الرضا",
      unit: "%",
      baseline: 60,
      target: 90,
      current: 75,
      source: "manual",
      direction: "up",
      attainment: 0.5,
    },
    {
      id: "i2",
      name: "عقود جديدة",
      unit: "ر.س",
      baseline: 0,
      target: 100,
      current: 40,
      source: "platform:contracts",
      direction: "up",
      attainment: 0.4,
    },
  ],
  initiatives: [
    {
      id: "n1",
      title: "استبيان",
      ownerId: "",
      startDate: "",
      dueDate: "2026-09-01",
      budget: 0,
      status: "doing",
    },
  ],
  reviews: [
    { id: "r1", quarter: 1, note: "بداية جيدة", createdAt: 1, snapshot: { progress: 0.3 } },
  ],
  progress: 0.475,
  status: "at_risk",
};
const routes = (role: string, cycles = [cycle]) => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/plans/cycles": () => ({ ok: true, cycles }),
  "GET /api/plans/cycles/c1": () => ({
    ok: true,
    cycle,
    objectives: [objective],
    progress: 0.475,
    status: "at_risk",
    budget: 5000,
  }),
  "GET /api/plans/owners": () => ({
    ok: true,
    owners: [{ id: "u2", name: "نورة", email: "n@a.sa" }],
  }),
});

describe("PlansPage", () => {
  it("shows objectives with progress, status, indicators from the platform, initiatives and the last review", async () => {
    stubApi(routes("owner"));
    await renderWithApp(<PlansPage />);
    expect(await screen.findByText("رفع رضا العملاء")).toBeInTheDocument();
    expect(screen.getAllByText("معرّض للتأخر")).toHaveLength(2); // the plan and its objective
    expect(screen.getByRole("progressbar", { name: "تقدّم رفع رضا العملاء" })).toHaveAttribute(
      "aria-valuenow",
      "48",
    );
    expect(screen.getByText("نسبة الرضا")).toBeInTheDocument();
    expect(screen.getByText("من المنصة")).toBeInTheDocument();
    expect(screen.getByText("المسؤول: نورة")).toBeInTheDocument();
    expect(screen.getByText(/آخر مراجعة \(الربع 1\): بداية جيدة/)).toBeInTheDocument();
    expect(screen.getAllByText("الربع 2").length).toBeGreaterThan(1); // the filter tab and the objective badge
  });

  it("filters the operational objectives by quarter", async () => {
    stubApi(routes("owner"));
    await renderWithApp(<PlansPage />);
    await screen.findByText("رفع رضا العملاء");
    await userEvent.click(screen.getByRole("tab", { name: "الربع 3" }));
    expect(screen.queryByText("رفع رضا العملاء")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "الربع 2" }));
    expect(screen.getByText("رفع رضا العملاء")).toBeInTheDocument();
  });

  it("invites creating the first strategic plan and posts it", async () => {
    const calls = stubApi({
      ...routes("owner", []),
      "POST /api/plans/cycles": () => [201, { ok: true, id: "c9" }],
    });
    await renderWithApp(<PlansPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "الخطة الاستراتيجية" }));
    expect(await screen.findByText("لا توجد خطة استراتيجية بعد")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الخطة" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "إنشاء" }),
    );
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/api/plans/cycles")).toBe(true),
    );
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      kind: "strategic",
      parentCycleId: "",
    });
  });

  it("a viewer reads the plan without edit controls", async () => {
    stubApi(routes("project-manager"));
    await renderWithApp(<PlansPage />);
    await screen.findByText("رفع رضا العملاء");
    expect(screen.queryByRole("button", { name: /تعديل الخطة|خطة جديدة|^هدف$|مراجعة/ })).toBeNull();
  });

  it("adds an indicator that follows a platform metric", async () => {
    const calls = stubApi({
      ...routes("owner"),
      "POST /api/plans/objectives/o1/indicators": () => [201, { ok: true, id: "i9" }],
    });
    await renderWithApp(<PlansPage />);
    await screen.findByText("رفع رضا العملاء");
    await userEvent.click(screen.getByRole("button", { name: /^مؤشر$/ }));
    const dlg = await screen.findByRole("dialog");
    await userEvent.selectOptions(
      within(dlg).getByLabelText("مصدر القيمة"),
      "platform:projects_started",
    );
    await userEvent.type(within(dlg).getByLabelText("المستهدف"), "12");
    await userEvent.click(within(dlg).getByRole("button", { name: "حفظ" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      source: "platform:projects_started",
      target: 12,
      name: "مشاريع بدأت",
    });
  });
});
