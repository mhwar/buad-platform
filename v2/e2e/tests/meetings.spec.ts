import { clientWithProject, expect, test } from "./fixtures";

test("a meeting planned from a project page is linked to it and to its client", async ({
  page,
  api,
}) => {
  const { clientId, projectId } = await clientWithProject(api);
  await page.goto(`/projects/${projectId}`);
  const card = page.getByLabel("الاجتماعات");
  await expect(card.getByText("لا اجتماعات مرتبطة بعد.")).toBeVisible();
  await card.getByRole("button", { name: "اجتماع" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "جدولة الاجتماع" }).click();
  await expect(card.getByText("قادم")).toBeVisible();

  await page.goto(`/clients/${clientId}?tab=crm`);
  await expect(page.getByLabel("الاجتماعات").getByText("قادم")).toBeVisible();
});
