import { expect, test } from "./fixtures";

test("a recovery key is made once in «حسابي», and «نسيت كلمة المرور؟» asks for it", async ({
  page,
  browser,
}) => {
  await page.goto("/settings/account");
  const card = page.getByLabel("مفتاح الاستعادة");
  await card.getByRole("button", { name: /مفتاح/ }).click();
  // a key that already exists is replaced only after asking
  const ask = page.getByRole("alertdialog");
  if (await ask.isVisible().catch(() => false))
    await ask.getByRole("button", { name: "إنشاء مفتاح جديد" }).click();
  await expect(card.getByText(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/)).toBeVisible();
  await expect(card).toContainText("لن يظهر مرة أخرى");

  // signed out: the link is on the sign-in page, and a wrong key changes nothing
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await guest.newPage();
  await p.goto("/login");
  await p.getByRole("link", { name: "نسيت كلمة المرور؟" }).click();
  await expect(p).toHaveURL(/\/recover$/);
  await p.getByLabel("البريد الإلكتروني").fill("owner@e2e.test");
  await p.getByLabel("مفتاح الاستعادة").fill("AAAAA-BBBBB-CCCCC-DDDDD");
  await p.getByLabel("كلمة المرور الجديدة").fill("not-applied-123");
  await p.getByLabel("تأكيد كلمة المرور").fill("not-applied-123");
  await p.getByRole("button", { name: "حفظ ودخول" }).click();
  await expect(p.getByText("البريد أو المفتاح غير صحيح")).toBeVisible();
  await guest.close();
});
