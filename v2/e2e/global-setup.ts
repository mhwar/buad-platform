import { mkdirSync, writeFileSync } from "node:fs";
import { type APIRequestContext, request } from "@playwright/test";
import { baseURL, OWNER_STATE } from "./playwright.config";

export const OWNER = {
  name: "مالك الاختبار",
  email: "owner@e2e.test",
  password: "a-long-e2e-owner-password",
};
/** Every default role but the owner's: each gets a signed-in session for the role specs. */
export const ROLE_KEYS = [
  "general-manager",
  "finance-manager",
  "project-manager",
  "sales",
  "accountant",
  "team-member",
  "viewer",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const roleState = (role: string) => `.auth/${role}.json`;
export const FIXTURE = ".auth/fixture.json";
const PASSWORD = "a-long-e2e-member-password";

async function json<T>(res: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<T> {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * Creates the owner on the fresh database (or signs in, on a reused server), one user per
 * default role, and a few shared records — among them a private project no one else is on.
 */
export default async function globalSetup() {
  mkdirSync(".auth", { recursive: true });
  const owner = await request.newContext({ baseURL });
  const setup = await owner.post("/api/setup/owner", {
    data: { token: process.env.E2E_SETUP_TOKEN ?? "e2e-setup-token-0123456789abcdef", ...OWNER },
  });
  if (!setup.ok()) {
    const login = await owner.post("/api/auth/login", {
      data: { email: OWNER.email, password: OWNER.password },
    });
    if (!login.ok()) throw new Error(`e2e owner: setup ${setup.status()}, login ${login.status()}`);
  }
  await owner.storageState({ path: OWNER_STATE });

  for (const role of ROLE_KEYS) {
    const email = `${role}@e2e.test`;
    const ctx = await request.newContext({ baseURL });
    const invite = await owner.post("/api/team/users", {
      data: { email, name: `اختبار ${role}`, roleKey: role },
    });
    if (invite.ok()) {
      const { setupToken } = await json<{ setupToken: string }>(invite);
      await json(
        await ctx.post("/api/auth/setup-password", { data: { setupToken, password: PASSWORD } }),
      );
    } else if (invite.status() === 409) {
      // A reused local server: the user is already there from an earlier run.
      await json(await ctx.post("/api/auth/login", { data: { email, password: PASSWORD } }));
    } else {
      throw new Error(`invite ${role} → ${invite.status()} ${await invite.text()}`);
    }
    await ctx.storageState({ path: roleState(role) });
    await ctx.dispose();
  }

  const stamp = Date.now().toString(36);
  const client = await json<{ id: string }>(
    await owner.post("/api/clients", {
      data: { name: `جمعية الأدوار ${stamp}`, type: "association" },
    }),
  );
  const project = (name: string, visibility: "team" | "private") =>
    owner.post("/api/projects", {
      data: { clientId: client.id, name, expectedValue: 50000, visibility },
    });
  const open = await json<{ id: string }>(await project(`مشروع الفريق ${stamp}`, "team"));
  const hidden = await json<{ id: string }>(await project(`مشروع سري ${stamp}`, "private"));
  const doc = await json<{ id: string }>(
    await owner.post(`/api/projects/${open.id}/documents`, {
      data: { kind: "contract", template: "blank" },
    }),
  );
  await json(
    await owner.post(`/api/documents/${doc.id}/status`, { data: { to: "review", version: 1 } }),
  );
  writeFileSync(
    FIXTURE,
    JSON.stringify({
      clientId: client.id,
      openProjectId: open.id,
      privateProjectId: hidden.id,
      privateProjectName: `مشروع سري ${stamp}`,
      docId: doc.id,
    }),
  );
  await owner.dispose();
}
