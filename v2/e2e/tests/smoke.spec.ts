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
