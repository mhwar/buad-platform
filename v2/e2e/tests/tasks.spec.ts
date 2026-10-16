import { expect, isPhone, test, uid } from "./fixtures";

test("tasks show as a board by status, and a card moves by dragging", async ({ page, api }) => {
  test.skip(isPhone(page), "dragging is a desktop gesture; phones use the status menu");
  const me = await api<{ user: { id: string } }>("GET", "/api/me");
  const title = `حجز القاعة ${uid()}`;
  await api("POST", "/api/tasks", { title, assigneeId: me.user.id, dueDate: "2020-05-01" });
  await page.goto("/tasks?layout=board");
  const board = page.getByRole("list", { name: "المهام حسب الحالة" });
  const col = (name: string) => board.getByRole("listitem", { name, exact: true });
  await expect(col("لم تبدأ").getByText(title)).toBeVisible();
  await col("لم تبدأ").getByText(title).dragTo(col("قيد التنفيذ"));
  await expect(col("قيد التنفيذ").getByText(title)).toBeVisible();

  await page.goto(`/tasks?layout=table&show=late&q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("table")).toContainText(title);
});

test("on a phone the table becomes rows and the board scrolls inside itself", async ({ page }) => {
  test.skip(!isPhone(page), "phone layout");
  await page.goto("/tasks?layout=table");
  await expect(page.getByRole("table")).toBeHidden();
  await page.goto("/tasks?layout=board");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
