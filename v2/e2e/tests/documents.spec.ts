import { clientWithProject, expect, test } from "./fixtures";

test("a document walks draft → review → approved → outgoing, and the list shows the wait", async ({
  page,
  api,
}) => {
  const { projectId } = await clientWithProject(api);
  const doc = await api<{ id: string }>("POST", `/api/projects/${projectId}/documents`, {
    kind: "contract",
    template: "blank",
  });
  await api("POST", `/api/documents/${doc.id}/status`, { to: "review", version: 1 });

  await page.goto("/documents");
  await expect(page.getByText("بانتظار الاعتماد منذ اليوم").first()).toBeVisible();

  await page.goto(`/projects/${projectId}/documents/${doc.id}`);
  const steps = page.getByRole("list", { name: "مراحل المستند" });
  await expect(steps.locator("[aria-current=step]")).toContainText("مراجعة");
  // Confirmations are the platform's own dialog (never the browser's), with the action named.
  // No spec fills «بيانات الجهة», so approving names what the contract would print as dots.
  await page.getByRole("button", { name: "اعتماد", exact: true }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("بيانات الجهة ناقصة");
  await expect(ask).toContainText("الرقم الضريبي");
  await ask.getByRole("button", { name: "اعتماد كما هو" }).click();
  await expect(steps.locator("[aria-current=step]")).toContainText("معتمد");
  await expect(page.getByRole("status").filter({ hasText: "اعتُمد المستند" })).toBeVisible();
  await page.getByRole("button", { name: "تسجيل صادر" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "تسجيل الصادر" }).click();
  await expect(steps.locator("[aria-current=step]")).toContainText("صادر");
});

test("«الإعدادات» opens on an overview that names what «بيانات الجهة» lacks", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "الإعدادات", level: 1 })).toBeVisible();
  await expect(page.getByText(/ما ينقص:.*الرقم الضريبي/)).toBeVisible();
  await page.getByRole("link", { name: "أكملوها" }).first().click();
  await expect(page).toHaveURL(/\/settings\/org$/);
  await page.goto("/settings/appearance");
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByRole("radiogroup", { name: "المظهر" })).toBeVisible();
});
