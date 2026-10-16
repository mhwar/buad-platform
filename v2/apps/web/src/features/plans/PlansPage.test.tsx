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
    await userEvent.click(screen.getByRole("button", { name: "خطة فارغة" }));
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

describe("the year-one template and tracking", () => {
  const revenueCycle = (kind: "strategic" | "operational", hidden = false) => ({
    ok: true,
    cycle: {
      ...cycle,
      id: kind === "strategic" ? "s1" : "c1",
      kind,
      name:
        kind === "strategic" ? "الخطة الاستراتيجية — السنة الأولى 2027" : "الخطة التشغيلية — 2027",
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      parentCycleId: kind === "operational" ? "s1" : "",
    },
    objectives: [
      {
        ...objective,
        id: kind === "strategic" ? "so1" : "oo1",
        cycleId: kind === "strategic" ? "s1" : "c1",
        title: kind === "strategic" ? "تحقيق إيرادات 2,000,000 ر.س" : "الربع الأول: الإطلاق",
        quarter: kind === "strategic" ? 0 : 1,
        indicators: [
          {
            id: kind === "strategic" ? "rev" : "revq1",
            name: "الإيرادات المحصّلة",
            unit: "ر.س",
            baseline: 0,
            target: kind === "strategic" ? 2_000_000 : 250_000,
            current: hidden ? null : 500_000,
            hidden,
            source: "platform:revenue",
            direction: "up",
            attainment: 0.25,
          },
        ],
        initiatives: [
          {
            id: "n9",
            title: "نشر الموقع الجديد",
            ownerId: "",
            startDate: "2027-01-01",
            dueDate: "2027-03-31",
            budget: 0,
            status: "doing",
            tasks: { total: 2, done: 1 },
          },
        ],
        reviews: [],
      },
    ],
    progress: 0.3,
    status: "on_track",
    budget: 0,
  });
  const tracked = (role = "owner", hidden = false) => ({
    "GET /api/me": () => ({ ok: true, user: meUser(role) }),
    "GET /api/plans/cycles": () => ({
      ok: true,
      cycles: [revenueCycle("strategic").cycle, revenueCycle("operational").cycle],
    }),
    "GET /api/plans/cycles/s1": () => revenueCycle("strategic", hidden),
    "GET /api/plans/cycles/c1": () => revenueCycle("operational", hidden),
    "GET /api/plans/owners": () => ({ ok: true, owners: [] }),
    "GET /api/plans/indicators/rev/series": () => ({
      ok: true,
      indicator: { id: "rev", name: "الإيرادات المحصّلة", unit: "ر.س", target: 2_000_000 },
      window: { start: "2027-01-01", end: "2027-12-31" },
      months: Array.from({ length: 12 }, (_, i) => ({
        month: `2027-${String(i + 1).padStart(2, "0")}`,
        value: i < 3 ? 166_666 : 0,
        cumulative: i < 3 ? 166_666 * (i + 1) : 500_000,
        future: i >= 3,
      })),
      pace: {
        share: 0.25,
        expected: 500_000,
        projected: 2_000_000,
        gap: 1_500_000,
        perMonthNeeded: 166_667,
        ahead: true,
      },
    }),
    "GET /api/sales/overview": () => ({
      ok: true,
      pipeline: { stages: [], open: { count: 4, value: 900_000, weighted: 300_000 } },
    }),
  });

  it("shows the revenue target panel with the pace and the quarters on the operational plan", async () => {
    stubApi(tracked());
    await renderWithApp(<PlansPage />);
    const panel = within(await screen.findByLabelText("لوحة المستهدف"));
    expect(panel.getByText("الإيرادات المحصّلة")).toBeInTheDocument();
    expect(await panel.findByText("متقدّم على المسار")).toBeInTheDocument();
    expect(panel.getByLabelText("المستهدف الربعي")).toHaveTextContent("الربع 1");
    expect(panel.getByText(/تكفي نظرياً|أقل من الفجوة/)).toBeInTheDocument();
  });

  it("hides the money from someone without finances, and lists everything in «المتابعة»", async () => {
    stubApi(tracked("project-manager", true));
    await renderWithApp(<PlansPage />);
    expect(
      await screen.findByText(/الأرقام المالية تظهر لمن لديه صلاحية المالية/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "المتابعة" }));
    const table = within(screen.getByLabelText("جدول المؤشرات"));
    expect(table.getByText("مخفي")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("المبادرات حسب الربع")).getByText("نشر الموقع الجديد"),
    ).toBeInTheDocument();
  });

  it("creates the year-one plan from the template", async () => {
    const calls = stubApi({
      ...routes("owner", []),
      "GET /api/plans/templates": () => ({
        ok: true,
        templates: [
          {
            key: "year-one",
            name: "خطة السنة الأولى",
            description: "إيرادات 2,000,000",
            objectives: ["أ"],
            quarters: ["ب"],
            usedYears: [],
          },
        ],
      }),
      "POST /api/plans/from-template/year-one": () => [201, { ok: true }],
    });
    await renderWithApp(<PlansPage />);
    await userEvent.click(await screen.findByRole("button", { name: /أنشئ خطة السنة الأولى/ }));
    const dlg = within(await screen.findByRole("dialog"));
    await userEvent.click(await dlg.findByRole("button", { name: /إنشاء الخطة لسنة/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.path).toBe(
        "/api/plans/from-template/year-one",
      ),
    );
  });
});
