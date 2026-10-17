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

test("a receipt above the contract asks first, and the overpaid project is flagged", async ({
  page,
  api,
}) => {
  const c = await api<{ id: string }>("POST", "/api/clients", { name: `جمعية الحد ${uid()}` });
  const name = `مشروع فوق العقد ${uid()}`;
  const p = await api<{ id: string }>("POST", "/api/projects", {
    clientId: c.id,
    name,
    expectedValue: 1000,
  });
  await api("PATCH", `/api/projects/${p.id}/finance/ctrl`, { version: 0, contractValue: 1000 });
  await api("POST", `/api/projects/${p.id}/finance/receipts`, {
    date: `${year}-03-01`,
    amount: 1150,
    note: "",
  });
  await page.goto(`/projects/${p.id}?view=finance`);
  await page
    .getByRole("button", { name: /تسجيل مقبوض/ })
    .first()
    .click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/المبلغ/).fill("1150");
  await dlg.getByRole("button", { name: "تسجيل المقبوض" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("المبلغ يتجاوز قيمة العقد");
  await ask.getByRole("button", { name: "تسجيله رغم ذلك" }).click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّل المقبوض" })).toBeVisible();

  await page.goto("/finance");
  const checks = page.getByLabel("تحتاج تدخلك");
  await checks.locator("summary").click();
  await expect(checks.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});

test("finance has four tabs, and older links land in their new home", async ({ page }) => {
  await page.goto("/finance");
  const tabs = page.getByRole("tablist", { name: "أقسام المالية" });
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  await expect(page.locator("#projects-profit")).toBeVisible();
  await page.goto("/finance?tab=partners");
  await expect(page.getByRole("heading", { name: "الشركاء والتوزيعات" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "إيرادات الشركة ومصروفاتها" })).toBeVisible();
});

test("VAT: the year by quarter, a sent invoice moves output VAT, a company purchase adds input VAT", async ({
  page,
  api,
}) => {
  const c = await api<{ id: string }>("POST", "/api/clients", { name: `جمعية الضريبة ${uid()}` });
  const name = `مشروع الضريبة ${uid()}`;
  const p = await api<{ id: string }>("POST", "/api/projects", { clientId: c.id, name });
  await api("PATCH", `/api/projects/${p.id}/finance/ctrl`, {
    version: 0,
    contractValue: 11500,
    vatIncluded: true,
  });
  await api("POST", `/api/projects/${p.id}/finance/receipts`, {
    date: `${year}-02-10`,
    amount: 11500,
    note: "",
  });

  // A tax invoice sent in May: the project's output VAT moves from Q1 to Q2.
  await page.goto(`/projects/${p.id}?view=finance`);
  await page.getByRole("tab", { name: /الفواتير/ }).click();
  await page.getByRole("button", { name: "فاتورة ضريبية مرسلة" }).click();
  const dlg = page.getByRole("dialog");
  const invNo = `INV-${uid()}`;
  await dlg.getByLabel("رقم الفاتورة").fill(invNo);
  await dlg.getByLabel("تاريخ الفاتورة").fill(`${year}-05-03`);
  await dlg.getByLabel("المبلغ شامل الضريبة (ر.س)").fill("11500");
  await dlg.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّلت الفاتورة" })).toBeVisible();

  await page.goto(`/finance?tab=vat&year=${year}&q=2`);
  await expect(page.getByRole("heading", { name: `إقرارات سنة ${year}` })).toBeVisible();
  await expect(page.getByText(invNo)).toBeVisible();

  await page.getByRole("button", { name: "مشترى للشركة" }).click();
  const buy = page.getByRole("dialog");
  await buy.getByLabel("البيان").fill(`جهاز ${uid()}`);
  await buy.getByLabel("تاريخ الفاتورة").fill(`${year}-05-10`);
  await buy.getByLabel("المبلغ شامل الضريبة (ر.س)").fill("2300");
  await buy.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّل المشترى بفاتورته" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "الشركة" }).first()).toBeVisible();
});

test("profit: balances say what was realized, settled and is still to distribute", async ({
  page,
}) => {
  await page.goto("/finance?tab=profit");
  const card = page.getByLabel("أرصدة الأرباح");
  await expect(card).toBeVisible();
  for (const t of ["ربح متحقق من المشاريع", "صافي الشركة", "أرباح غير موزّعة"])
    await expect(card.getByText(t, { exact: true })).toBeVisible();
});
