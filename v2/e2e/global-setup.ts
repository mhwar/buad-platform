import { mkdirSync } from "node:fs";
import { request } from "@playwright/test";
import { baseURL, OWNER_STATE } from "./playwright.config";

export const OWNER = {
  name: "مالك الاختبار",
  email: "owner@e2e.test",
  password: "a-long-e2e-owner-password",
};

/** Creates the owner on the fresh database (or signs in, on a reused server) and keeps the session. */
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL });
  const setup = await ctx.post("/api/setup/owner", {
    data: { token: process.env.E2E_SETUP_TOKEN ?? "e2e-setup-token-0123456789abcdef", ...OWNER },
  });
  if (!setup.ok()) {
    const login = await ctx.post("/api/auth/login", {
      data: { email: OWNER.email, password: OWNER.password },
    });
    if (!login.ok()) throw new Error(`e2e owner: setup ${setup.status()}, login ${login.status()}`);
  }
  mkdirSync(".auth", { recursive: true });
  await ctx.storageState({ path: OWNER_STATE });
  await ctx.dispose();
}
