import { describe, expect, it } from "vitest";
import { router } from "./router";

describe("router", () => {
  it("builds with the hub routes and the legacy addresses", () => {
    const paths = Object.keys(router.routesByPath);
    for (const p of [
      "/more",
      "/soon",
      "/sales",
      "/tasks",
      "/plans",
      "/settings/team",
      "/settings/activity",
      "/more/soon/$key",
      "/more/team",
      "/more/receivables",
    ])
      expect(paths).toContain(p);
  });
});
