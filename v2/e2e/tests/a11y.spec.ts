import AxeBuilder from "@axe-core/playwright";
import { clientWithProject, expect, test } from "./fixtures";

/** WCAG 2.1 A/AA with axe-core, on the main pages, in the light and the dark theme. */
const PAGES = [
  "/",
  "/projects",
  "/clients",
  "/sales",
  "/tasks",
  "/documents",
  "/finance",
  "/finance?tab=profit",
  "/finance?tab=vat",
  "/reports",
  "/plans",
  "/settings/finance",
  "/settings/quality",
];

for (const theme of ["light", "dark"] as const)
  test(`no accessibility violations (${theme})`, async ({ page, api }, info) => {
    test.skip(info.project.name === "phone", "the same pages; the desktop run covers them");
    test.setTimeout(120_000);
    const { projectId } = await clientWithProject(api);
    await page.addInitScript((t) => localStorage.setItem("buad-theme", t), theme);
    const found: string[] = [];
    let checked = 0;
    for (const path of [...PAGES, `/projects/${projectId}`]) {
      await page.goto(path);
      await page.getByRole("main").waitFor();
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      checked += r.passes.length;
      for (const v of r.violations)
        found.push(
          `${path} · ${v.id} (${v.impact}): ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(" "))
            .join(" | ")}`,
        );
    }
    // axe really ran: it passed rules on every page, and found nothing to flag.
    expect(checked).toBeGreaterThan(PAGES.length * 10);
    expect(found).toEqual([]);
  });
