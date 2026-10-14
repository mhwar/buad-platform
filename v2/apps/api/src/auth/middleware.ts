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

const deny = (c: { json: (b: unknown, s: 403) => Response }) =>
  c.json({ ok: false, error: "forbidden" }, 403);

/** Requires every listed permission («module.action») of the signed-in user's role. */
export const requirePerm = (...perms: string[]) =>
  createMiddleware<{ Variables: Vars }>(async (c, next) => {
    const have = c.get("user").perms;
    if (!perms.every((p) => have.includes(p))) return deny(c);
    await next();
  });

/** Reads need `view`, anything that changes data needs `edit` of the same module. */
export const requireRW = (view: string, edit: string) =>
  createMiddleware<{ Variables: Vars }>(async (c, next) => {
    const need = c.req.method === "GET" || c.req.method === "HEAD" ? view : edit;
    if (!c.get("user").perms.includes(need)) return deny(c);
    await next();
  });
