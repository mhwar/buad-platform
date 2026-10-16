import { readFileSync } from "node:fs";
import { defaultRole } from "@buad/domain";
import { FIXTURE, ROLE_KEYS, roleState } from "../global-setup";
import { expect, isPhone, test } from "./fixtures";

type Fixture = {
  clientId: string;
  openProjectId: string;
  privateProjectId: string;
  privateProjectName: string;
  docId: string;
};
const fx = (): Fixture => JSON.parse(readFileSync(FIXTURE, "utf8"));

/** Each guarded page and the permission its route asks for (router.tsx → `needs()`). */
const ROUTES: [path: string, perm: string][] = [
  ["/finance", "treasury.view"],
  ["/finance/vat/report", "vat.view"],
  ["/sales", "sales.view"],
  ["/meetings", "meetings.view"],
  ["/decisions", "meetings.view"],
  ["/tasks", "tasks.view"],
  ["/plans", "plans.view"],
  ["/products", "products.view"],
  ["/settings/team", "team.view"],
  ["/settings/activity", "audit.view"],
];
/** The «إنشاء جديد» menu offers something to anyone holding one of these. */
const CREATE_PERMS = ["sales.edit", "clients.edit", "projects.edit", "tasks.edit", "meetings.edit"];

// What each role may do comes from the role definitions themselves, so the specs follow them.
for (const role of ROLE_KEYS) {
  const def = defaultRole(role);
  if (!def) throw new Error(`no default role ${role}`);
  const can = (p: string) => def.perms.includes(p);
  const scopeAll = def.scopes.projects === "all";

  test.describe(`role: ${role}`, () => {
    test.use({ storageState: roleState(role) });
    test.beforeEach(({ page }) => {
      test.skip(isPhone(page), "the role matrix runs at desktop size; the phone has its own check");
    });

    test("opens the pages its role allows and is sent home from the rest", async ({ page }) => {
      for (const [path, perm] of ROUTES) {
        await page.goto(path);
        if (can(perm)) {
          await expect(page, `${role} should open ${path}`).toHaveURL(new RegExp(`${path}(\\?|$)`));
          await expect(page.getByRole("alert")).toHaveCount(0);
        } else {
          await expect(page, `${role} must not open ${path}`).toHaveURL(/\/(\?.*)?$/);
        }
      }
    });

    test("the menu shows only its sections and its own «إنشاء جديد»", async ({ page }) => {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "الأقسام" });
      await expect(nav).toBeVisible();
      // A section may carry a count badge («المالية 2»), so match its name from the start.
      const section = (name: string) =>
        nav
          .getByRole("link", { name: new RegExp(`^${name}`) })
          .or(nav.getByRole("button", { name: new RegExp(`^${name}`) }));
      await expect(section("المالية")).toHaveCount(can("treasury.view") ? 1 : 0);
      await expect(section("المبيعات")).toHaveCount(can("sales.view") ? 1 : 0);
      await expect(section("التخطيط")).toHaveCount(
        ["plans.view", "products.view", "site.view"].some(can) ? 1 : 0,
      );
      await expect(page.getByRole("button", { name: "إنشاء جديد" }).first()).toHaveCount(
        CREATE_PERMS.some(can) ? 1 : 0,
      );
    });

    test("money and edit buttons follow its permissions", async ({ page }) => {
      const f = fx();
      await page.goto(`/clients/${f.clientId}`);
      const pulse = page.getByRole("list", { name: "نبض العميل" });
      await expect(pulse).toBeVisible();
      const owed = pulse.getByRole("listitem").filter({ hasText: "المستحق على العميل" });
      if (can("finance.view")) await expect(owed).toContainText("ر.س");
      else await expect(owed).not.toContainText("ر.س");
      await expect(page.getByRole("button", { name: "تعديل" })).toHaveCount(
        can("clients.edit") ? 1 : 0,
      );

      await page.goto(`/projects/${f.openProjectId}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.getByLabel("العقد والتحصيل")).toHaveCount(can("finance.view") ? 1 : 0);

      await page.goto(`/projects/${f.openProjectId}/documents/${f.docId}`);
      await expect(page.getByRole("list", { name: "مراحل المستند" })).toBeVisible();
      await expect(page.getByRole("button", { name: "اعتماد" })).toHaveCount(
        can("documents.edit") ? 1 : 0,
      );
    });

    test(`${scopeAll ? "sees" : "does not see"} a private project it is not on`, async ({
      page,
    }) => {
      const f = fx();
      await page.goto("/projects");
      await expect(page.locator("main h1")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(f.privateProjectName)).toHaveCount(scopeAll ? 1 : 0);
      await page.goto(`/projects/${f.privateProjectId}`);
      if (scopeAll) await expect(page.locator("main h1")).toContainText(f.privateProjectName);
      else await expect(page.getByText("المشروع غير موجود")).toBeVisible();
    });

    test("the API refuses what the screen hides", async ({ page }) => {
      const meetings = await page.request.get("/api/meetings");
      expect(meetings.status()).toBe(can("meetings.view") ? 200 : 403);
      if (!can("clients.edit")) {
        const add = await page.request.post("/api/clients", {
          data: { name: "لا ينبغي", type: "company" },
        });
        expect(add.status()).toBe(403);
      }
      if (!can("treasury.view")) {
        expect((await page.request.get("/api/finance/company/partners")).status()).toBe(403);
      }
    });
  });
}

test.describe("viewer on a phone", () => {
  test.use({ storageState: roleState("viewer") });
  test("reads without create buttons, in the drawer and the palette", async ({ page }) => {
    test.skip(!isPhone(page), "phone layout");
    await page.goto("/");
    await expect(page.getByRole("button", { name: "إنشاء جديد" })).toHaveCount(0);
    await page.getByRole("button", { name: "المزيد" }).click();
    await expect(page.getByRole("dialog").getByText("المالية", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /بحث/ }).first().click();
    await page.getByRole("combobox").fill("جديد");
    await expect(page.getByRole("option", { name: /جديدة?$/ })).toHaveCount(0);
  });
});
