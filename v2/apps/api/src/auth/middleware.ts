import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { type AuthUser, type Db, getUser } from "./service";
import { SESSION_COOKIE, verifySession } from "./session";

export type Vars = { db: Db; user: AuthUser };

/** Resolves the session cookie (or Bearer token), then re-reads the user so revocation takes effect. */
export const requireAuth = createMiddleware<{ Bindings: { JWT_SECRET: string }; Variables: Vars }>(
  async (c, next) => {
    const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    const token = getCookie(c, SESSION_COOKIE) ?? bearer;
    const claims = token ? await verifySession(c.env.JWT_SECRET, token) : null;
    if (!claims) return c.json({ ok: false, error: "unauthorized" }, 401);
    const user = await getUser(c.get("db"), claims.sub);
    if (!user || user.tokenVersion !== claims.v)
      return c.json({ ok: false, error: "unauthorized" }, 401);
    c.set("user", user);
    await next();
  },
);

export const requireRole = (...roles: string[]) =>
  createMiddleware<{ Variables: Vars }>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) return c.json({ ok: false, error: "forbidden" }, 403);
    await next();
  });
