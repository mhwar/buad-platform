import { test as base, expect, type Page } from "@playwright/test";

type Json = Record<string, unknown>;
export type Api = <T = Json>(method: string, path: string, body?: unknown) => Promise<T>;

/** A short suffix so each spec's records are its own on the shared database. */
export const uid = () => Math.random().toString(36).slice(2, 7);

/**
 * `api`: the platform's JSON API as the signed-in owner, to set up records quickly.
 * Every page also fails its test on an uncaught script error.
 */
export const test = base.extend<{ api: Api; pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use(errors);
      expect(errors, "uncaught errors on the page").toEqual([]);
    },
    { auto: true },
  ],
  api: async ({ page }, use) => {
    await use(async (method, path, body) => {
      const res = await page.request.fetch(path, { method, data: body });
      if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${await res.text()}`);
      return res.json();
    });
  },
});
export { expect };

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** No page should scroll sideways, at any size. */
export async function expectNoSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    "horizontal overflow",
  ).toBe(false);
}

/** A client with one running project (contract 90,000 + VAT) and a late instalment. */
export async function clientWithProject(api: Api, name = `جمعية ${uid()}`) {
  const c = await api<{ id: string }>("POST", "/api/clients", { name, type: "association" });
  const p = await api<{ id: string }>("POST", "/api/projects", {
    clientId: c.id,
    name: `ملتقى ${uid()}`,
    expectedValue: 90000,
    startDate: "2026-01-01",
    endDate: "2026-06-30",
  });
  await api("PATCH", `/api/projects/${p.id}`, { status: "active" });
  await api("POST", `/api/receivables/projects/${p.id}`, {
    label: "الدفعة الأولى",
    dueDate: "2020-04-01",
    amount: 30000,
  });
  return { clientId: c.id, clientName: name, projectId: p.id };
}
