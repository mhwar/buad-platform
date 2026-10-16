import { expect, expectNoSideScroll, test, uid } from "./fixtures";

const year = new Date().getFullYear();

test("year review: a finished project still owed money is fixed from the list", async ({
  page,
  api,
}) => {
  const c = await api<{ id: string }>("POST", "/api/clients", {
    name: `جمعية المراجعة ${uid()}`,
    type: "association",
  });
  const name = `مشروع للمراجعة ${uid()}`;
  const p = await api<{ id: string }>("POST", "/api/projects", {
    clientId: c.id,
    name,
    expectedValue: 10000,
    status: "completed",
  });
  await api("PATCH", `/api/projects/${p.id}/finance/ctrl`, {
    version: 0,
    contractValue: 10000,
    contractDate: `${year}-01-15`,
  });
  // 11,500 with VAT; 5,000 recorded so far
  await api("POST", `/api/projects/${p.id}/finance/receipts`, {
    date: `${year}-02-01`,
    amount: 5000,
    note: "",
  });

  await page.goto("/finance?tab=review");
  const before = await page.getByLabel("الإيراد مقابل المستهدف").innerText();
  const list = page.getByRole("region", { name: "المشاريع للمراجعة" });
  const card = list.locator("li").filter({ hasText: name });
  await expect(card.getByText("مكتمل وعليه متبقٍّ")).toBeVisible();
  await expectNoSideScroll(page);

  await card.getByRole("button", { name: "تسجيل استلام" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/تاريخ وصوله/).fill(`${year}-03-01`);
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(card).toHaveCount(0); // settled: nothing left to review
  await expect(page.getByLabel("الإيراد مقابل المستهدف")).not.toHaveText(before);
});

test("an instalment can be received in part, keeping the rest", async ({ page, api }) => {
  const c = await api<{ id: string }>("POST", "/api/clients", { name: `عميل ${uid()}` });
  const p = await api<{ id: string }>("POST", "/api/projects", {
    clientId: c.id,
    name: `مشروع الدفعات ${uid()}`,
    expectedValue: 20000,
  });
  await api("POST", `/api/receivables/projects/${p.id}`, {
    label: "الدفعة الأولى",
    dueDate: `${year}-01-10`,
    amount: 10000,
  });
  await page.goto("/finance?tab=receivables");
  const row = page.locator("li, tr").filter({ hasText: "الدفعة الأولى" }).first();
  await row.getByRole("button", { name: /تم الاستلام/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/المبلغ المستلم/).fill("4000");
  await expect(dialog.getByText(/استلام جزئي/)).toBeVisible();
  await dialog.getByRole("button", { name: "تسجيل الاستلام" }).click();
  await expect(page.getByText("الدفعة الأولى (المتبقي)").first()).toBeVisible();
});
