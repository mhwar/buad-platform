import { describe, expect, it } from "vitest";
import { router } from "./router";

describe("router", () => {
  it("builds with the hub routes and the legacy addresses", () => {
    const paths = Object.keys(router.routesByPath);
    for (const p of ["/more", "/more/team", "/more/activity", "/more/soon/$key", "/settings/team"])
      expect(paths).toContain(p);
  });
});
