import { clientWithProject, expect, test, uid } from "./fixtures";

test("search finds documents and tasks, and «اجتماع جديد» opens its form", async ({
  page,
  api,
}) => {
  const { projectId } = await clientWithProject(api);
  const word = `ترشيح${uid()}`;
  await api("POST", `/api/projects/${projectId}/documents`, {
    kind: "letter",
    template: "custom",
    title: `خطاب ${word}`,
  });
  await api("POST", "/api/tasks", { title: `مراجعة ${word}`, projectId });

  await page.goto("/");
  // The header's search button on both sizes (Ctrl+K is the same palette, checked in unit tests).
  const open = () => page.getByRole("button", { name: /بحث/ }).first().click();
  await open();
  await page.getByRole("combobox").fill(word);
  await expect(page.getByRole("option", { name: new RegExp(`خطاب ${word}`) })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(`مراجعة ${word}`) })).toBeVisible();
  await page.getByRole("option", { name: new RegExp(`خطاب ${word}`) }).click();
  await expect(page).toHaveURL(/\/documents\//);

  await page.goto("/");
  await open();
  await page.getByRole("combobox").fill("اجتماع جديد");
  await page.getByRole("option", { name: "اجتماع جديد" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "اجتماع جديد" }),
  ).toBeVisible();
});
