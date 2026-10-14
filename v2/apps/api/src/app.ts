import {
  changePasswordInput,
  healthResponse,
  loginInput,
  ownerSetupInput,
  setPasswordInput,
} from "@buad/schema";
import { users } from "@buad/schema/db";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { requireAuth, requireRole, type Vars } from "./auth/middleware";
import { type Db, getUser, login, setPassword } from "./auth/service";
import { SESSION_COOKIE, SESSION_TTL, signSession, signSetup, verifySetup } from "./auth/session";
import { claimOwner, ownerExists, setupEnabled, tokenMatches } from "./auth/setup";
import { assetsApp, type FileStore } from "./modules/assets";
import { clientsApp } from "./modules/clients";
import { companyFinanceApp } from "./modules/company-finance";
import { documentsApp, projectDocumentsApp } from "./modules/documents";
import { financeApp } from "./modules/finance";
import { financeOverviewApp } from "./modules/finance-overview";
import { importApp } from "./modules/importer";
import { orgApp } from "./modules/org";
import { type BrowserBinding, pdfApp } from "./modules/pdf";
import { projectsApp } from "./modules/projects";
import { documentSharesApp, publicShareApp } from "./modules/share";

export type Env = {
  APP_VERSION: string;
  JWT_SECRET: string;
  /** Optional. Enables the one-time /setup flow that creates the first owner. */
  OWNER_SETUP_TOKEN?: string;
  /** R2 bucket for uploaded files (logos, stamps, letterheads). */
  FILES?: FileStore;
  /** Cloudflare Browser Run, for vector PDFs. */
  BROWSER?: BrowserBinding;
  DB: Parameters<typeof drizzle>[0];
};

export type AppDeps = { getDb?: (env: Env) => Db };

const sessionCookie = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict" as const,
  path: "/",
  maxAge: SESSION_TTL,
};

export function createApp(deps: AppDeps = {}) {
  const getDb = deps.getDb ?? ((env: Env) => drizzle(env.DB) as unknown as Db);

  return (
    new Hono<{ Bindings: Env; Variables: Vars }>()
      .use(secureHeaders())
      .use(async (c, next) => {
        c.set("db", getDb(c.env));
        await next();
      })
      .get("/api/health", (c) =>
        c.json(
          healthResponse.parse({ ok: true, service: "buad-v2-api", version: c.env.APP_VERSION }),
        ),
      )

      // One-time first-owner setup. Invisible (404) unless OWNER_SETUP_TOKEN is configured.
      .get("/api/setup/status", async (c) => {
        const needsSetup =
          setupEnabled(c.env.OWNER_SETUP_TOKEN) && !(await ownerExists(c.get("db")));
        return c.json({ ok: true, needsSetup });
      })

      .post("/api/setup/owner", zValidator("json", ownerSetupInput), async (c) => {
        const expected = c.env.OWNER_SETUP_TOKEN;
        if (!setupEnabled(expected)) return c.json({ ok: false, error: "not_found" }, 404);
        const input = c.req.valid("json");
        if (!(await tokenMatches(input.token, expected))) {
          return c.json({ ok: false, error: "invalid_token" }, 403);
        }
        const db = c.get("db");
        if (await ownerExists(db)) return c.json({ ok: false, error: "already_set_up" }, 409);
        const claim = await claimOwner(db, input);
        if (!claim.ok) return c.json({ ok: false, error: "already_set_up" }, 409);
        const user = await getUser(db, claim.userId);
        if (!user) return c.json({ ok: false, error: "internal_error" }, 500);
        setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, user), sessionCookie);
        return c.json({ ok: true, user: publicUser(user) });
      })

      .post("/api/auth/login", zValidator("json", loginInput), async (c) => {
        const { email, password } = c.req.valid("json");
        const res = await login(c.get("db"), email, password);
        if (res.status === "invalid")
          return c.json({ ok: false, error: "invalid_credentials" }, 401);
        setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, res.user), sessionCookie);
        return c.json({ ok: true, user: publicUser(res.user) });
      })

      .post("/api/auth/setup-password", zValidator("json", setPasswordInput), async (c) => {
        const { setupToken, password } = c.req.valid("json");
        const claims = await verifySetup(c.env.JWT_SECRET, setupToken);
        if (!claims) return c.json({ ok: false, error: "invalid_token" }, 401);
        const db = c.get("db");
        const current = await getUser(db, claims.sub);
        if (!current || current.tokenVersion !== claims.v)
          return c.json({ ok: false, error: "invalid_token" }, 401);
        await setPassword(db, claims.sub, password);
        const fresh = await getUser(db, claims.sub);
        if (!fresh) return c.json({ ok: false, error: "invalid_token" }, 401);
        setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, fresh), sessionCookie);
        return c.json({ ok: true, user: publicUser(fresh) });
      })

      .post("/api/auth/logout", (c) => {
        deleteCookie(c, SESSION_COOKIE, { path: "/" });
        return c.json({ ok: true });
      })

      .post(
        "/api/auth/change-password",
        requireAuth,
        zValidator("json", changePasswordInput),
        async (c) => {
          const { current, password } = c.req.valid("json");
          const db = c.get("db");
          const me = c.get("user");
          const check = await login(db, me.email, current);
          if (check.status !== "ok") return c.json({ ok: false, error: "wrong_password" }, 403);
          await setPassword(db, me.id, password);
          const fresh = await getUser(db, me.id);
          if (!fresh) return c.json({ ok: false, error: "unauthorized" }, 401);
          setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, fresh), sessionCookie);
          return c.json({ ok: true });
        },
      )

      // Admin-issued invite: the only way a pending user gets to choose a first password.
      .post("/api/users/:id/invite", requireAuth, requireRole("owner", "admin"), async (c) => {
        const target = await getUser(c.get("db"), c.req.param("id"));
        // Same 404 for "missing" and "other org" so ids in other orgs cannot be probed.
        if (!target || target.orgId !== c.get("user").orgId)
          return c.json({ ok: false, error: "not_found" }, 404);
        return c.json({ ok: true, setupToken: await signSetup(c.env.JWT_SECRET, target) });
      })

      .get("/api/me", requireAuth, (c) => c.json({ ok: true, user: publicUser(c.get("user")) }))

      // Every query below is scoped by the caller's org — the pattern all future routes follow.
      .get("/api/users", requireAuth, requireRole("owner", "admin"), async (c) => {
        const rows = await c
          .get("db")
          .select({ id: users.id, email: users.email, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.orgId, c.get("user").orgId));
        return c.json({ ok: true, users: rows });
      })

      .route("/api/clients", clientsApp)
      .route("/api/projects/:projectId/finance", financeApp)
      .route("/api/projects/:projectId/documents", projectDocumentsApp)
      .route("/api/documents/:docId/shares", documentSharesApp)
      .route("/api/documents", documentsApp)
      .route("/api/public/s", publicShareApp)
      .route("/api/pdf", pdfApp)
      .route("/api/finance/company", companyFinanceApp)
      .route("/api/finance", financeOverviewApp)
      .route("/api/projects", projectsApp)
      .route("/api/import", importApp)
      .route("/api/assets", assetsApp)
      .route("/api/org", orgApp)

      .onError((err, c) => {
        console.error(err);
        return c.json({ ok: false, error: "internal_error" }, 500);
      })
      .notFound((c) => c.json({ ok: false, error: "not_found" }, 404))
  );
}

const publicUser = (u: {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}) => ({
  id: u.id,
  orgId: u.orgId,
  email: u.email,
  name: u.name,
  role: u.role,
});

export const app = createApp();
export type AppType = ReturnType<typeof createApp>;
