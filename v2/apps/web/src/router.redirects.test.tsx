import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { router } from "./router";

const resolve = async (from: string) => {
  const r = createRouter({
    routeTree: router.routeTree,
    history: createMemoryHistory({ initialEntries: [from] }),
  });
  await r.load();
  return `${r.state.location.pathname}${r.state.location.searchStr}`;
};

describe("old addresses", () => {
  it.each([
    ["/more/plans", "/plans"],
    ["/more/tasks", "/tasks"],
    ["/more/sales", "/sales"],
    ["/more/team", "/settings/team"],
    ["/more/activity", "/settings/activity"],
    ["/more/receivables", "/finance?tab=receivables"],
    ["/products?tab=requests", "/sales"],
    ["/sales/pipeline", "/sales"],
    ["/import", "/settings/import"],
    ["/account", "/settings/account"],
  ])("%s → %s", async (from, to) => {
    expect(await resolve(from)).toBe(to);
  });
});
