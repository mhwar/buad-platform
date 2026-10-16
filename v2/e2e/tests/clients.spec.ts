import { clientWithProject, expect, expectNoSideScroll, test } from "./fixtures";

test("a client's card and page show what it owes, its late instalment and open opportunity", async ({
  page,
  api,
}) => {
  const { clientId, clientName } = await clientWithProject(api);
  await api("POST", "/api/product-requests", {
    clientId,
    name: "جهة اتصال",
    productId: "",
    packageId: "",
    value: 40000,
    ownerId: "",
    followUpAt: "",
    message: "",
  });
  await page.goto(`/clients?q=${encodeURIComponent(clientName)}`);
  // The search leaves this one client: its card carries the health signs.
  const main = page.locator("main");
  await expect(main.getByText(clientName).first()).toBeVisible();
  await expect(main.getByText("1 فرصة مفتوحة").first()).toBeVisible();
  await expect(main.getByText("1 دفعة متأخرة").first()).toBeVisible();
  await expect(main.getByText("المستحق عليه").first()).toBeVisible();

  await page.goto(`/clients/${clientId}`);
  const pulse = page.getByRole("list", { name: "نبض العميل" });
  await expect(pulse).toContainText("الفرص المفتوحة");
  await expect(pulse).toContainText("103,500");
  await pulse.getByRole("button", { name: /الفرص المفتوحة/ }).click();
  await expect(page).toHaveURL(/tab=crm/);
  await expectNoSideScroll(page);
});
