import { clientWithProject, expect, expectNoSideScroll, test } from "./fixtures";

test("the main pages open without errors or sideways scrolling", async ({ page, api }) => {
  const { clientId, projectId } = await clientWithProject(api);
  for (const path of [
    "/",
    "/clients",
    `/clients/${clientId}`,
    "/projects",
    `/projects/${projectId}`,
    "/sales",
    "/tasks",
    "/documents",
    "/meetings",
    "/finance",
    "/finance?tab=vat",
    "/finance?tab=profit",
    "/finance?tab=receivables",
    "/reports",
    "/plans",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("alert"), `error card on ${path}`).toHaveCount(0);
    await expectNoSideScroll(page);
  }
});

test("a missing record says so instead of failing", async ({ page }) => {
  await page.goto("/projects/does-not-exist");
  await expect(page.getByText("المشروع غير موجود")).toBeVisible();
});

test("phone: no squeezed tables, no text under 12px, no raw dates", async ({ page, api }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "phone layout");
  await clientWithProject(api);
  await api("POST", "/api/tasks", { title: "مهمة بتاريخ", dueDate: "2026-09-30" });
  for (const path of [
    "/finance",
    "/projects?view=list",
    "/clients?view=list",
    "/tasks?layout=table&scope=all",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main table:visible"), `table on ${path}`).toHaveCount(0);
    const tiny = await page.evaluate(
      () =>
        [...document.querySelectorAll("main *")].filter((el) => {
          const t = (el as HTMLElement).innerText?.trim();
          if (!t || el.children.length) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && Number.parseFloat(getComputedStyle(el).fontSize) < 12;
        }).length,
    );
    expect(tiny, `text under 12px on ${path}`).toBe(0);
    await expect(
      page.locator("main").getByText(/\b\d{4}-\d{2}-\d{2}\b/),
      `raw date on ${path}`,
    ).toHaveCount(0);
  }
});
