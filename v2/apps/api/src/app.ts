import { healthResponse, loginInput, setPasswordInput } from "@buad/schema";
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

export type Env = { APP_VERSION: string; JWT_SECRET: string; DB: Parameters<typeof drizzle>[0] };

export type AppDeps = { getDb?: (env: Env) => Db };

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

      .post("/api/auth/login", zValidator("json", loginInput), async (c) => {
        const { email, password } = c.req.valid("json");
        const res = await login(c.get("db"), email, password);
        if (res.status === "invalid")
          return c.json({ ok: false, error: "invalid_credentials" }, 401);
        if (res.status === "setup") {
          return c.json({
            ok: true,
            action: "setup",
            setupToken: await signSetup(c.env.JWT_SECRET, res.user),
          });
        }
        setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, res.user), {
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
          path: "/",
          maxAge: SESSION_TTL,
        });
        return c.json({ ok: true, user: publicUser(res.user) });
      })

      .post("/api/auth/setup-password", zValidator("json", setPasswordInput), async (c) => {
        const { setupToken, password } = c.req.valid("json");
        const claims = await verifySetup(c.env.JWT_SECRET, setupToken);
        if (!claims) return c.json({ ok: false, error: "invalid_token" }, 401);
        const db = c.get("db");
        const current = await getUser(db, claims.sub);
        if (!current) return c.json({ ok: false, error: "invalid_token" }, 401);
        await setPassword(db, claims.sub, password);
        const fresh = await getUser(db, claims.sub);
        if (!fresh) return c.json({ ok: false, error: "invalid_token" }, 401);
        setCookie(c, SESSION_COOKIE, await signSession(c.env.JWT_SECRET, fresh), {
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
          path: "/",
          maxAge: SESSION_TTL,
        });
        return c.json({ ok: true, user: publicUser(fresh) });
      })

      .post("/api/auth/logout", (c) => {
        deleteCookie(c, SESSION_COOKIE, { path: "/" });
        return c.json({ ok: true });
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
