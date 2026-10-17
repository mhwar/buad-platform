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

  await card.getByRole("button", { name: "تسجيل مقبوض" }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`تسجيل مقبوض — ${name}`) });
  await dialog.getByLabel(/تاريخ وصوله/).fill(`${year}-03-01`);
  await dialog.getByRole("button", { name: "تسجيل المقبوض" }).click();
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
  await row.getByRole("button", { name: /تسجيل مقبوض/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/المبلغ المستلم/).fill("4000");
  await expect(dialog.getByText(/استلام جزئي/)).toBeVisible();
  await dialog.getByRole("button", { name: "تسجيل المقبوض" }).click();
  await expect(page.getByText("الدفعة الأولى (المتبقي)").first()).toBeVisible();
});

test("from «اليوم» a receipt is two clicks away, with its instalment suggested", async ({
  page,
  api,
}) => {
  const c = await api<{ id: string }>("POST", "/api/clients", { name: `عميل ${uid()}` });
  const name = `مشروع اليوم ${uid()}`;
  const p = await api<{ id: string }>("POST", "/api/projects", {
    clientId: c.id,
    name,
    expectedValue: 20000,
  });
  await api("POST", `/api/receivables/projects/${p.id}`, {
    label: "الدفعة الأولى",
    dueDate: `${year}-02-10`,
    amount: 9000,
  });
  await page.goto("/");
  await expect(page.getByLabel("الإيراد مقابل المستهدف")).toBeVisible();
  // click 1
  await page
    .getByLabel("الإيراد مقابل المستهدف")
    .getByRole("button", { name: "تسجيل مقبوض" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); // click 2 is choosing the project
  await dialog.getByLabel("المشروع").selectOption(p.id);
  await expect(dialog.getByRole("radio", { name: /الدفعة الأولى/ })).toBeChecked();
  await dialog.getByRole("button", { name: "تسجيل المقبوض" }).click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّل المقبوض" })).toBeVisible();
});

test("«الإعدادات ← المالية» keeps a target and one opening balance for everyone", async ({
  page,
  api,
}) => {
  const next = year + 1; // next year's target, so the other specs' current-year figures stay put
  await page.goto("/settings/finance");
  await expect(page.getByRole("heading", { name: "المالية", level: 1 })).toBeVisible();
  const target = page.getByLabel(`مستهدف ${next} (ر.س)`);
  await target.fill("2500000");
  await page.getByRole("button", { name: `حفظ مستهدف ${next}` }).click();
  await expect(page.getByRole("status").filter({ hasText: `حُفظ مستهدف ${next}` })).toBeVisible();

  await page.getByLabel("الرصيد (ر.س)").fill("120000");
  await page.getByLabel("بتاريخ").fill(`${year}-10-01`);
  await page
    .getByRole("region", { name: "الرصيد الافتتاحي" })
    .getByRole("button", { name: "حفظ" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "حُفظ الرصيد الافتتاحي" })).toBeVisible();

  // the same figure starts the cash forecast, saved for everyone rather than on this device
  await page.goto("/finance?tab=receivables");
  await expect(page.getByLabel("الرصيد الحالي (ر.س)")).toHaveValue("120000");
  await expect(page.getByText(/محفوظ للجميع/)).toBeVisible();

  const s = await api<{ targets: Record<string, number> }>("GET", "/api/org/settings");
  expect(s.targets[String(next)]).toBe(2500000);
  await api("PATCH", "/api/org/settings", { targets: { [String(next)]: null }, cashOpening: null });
});
