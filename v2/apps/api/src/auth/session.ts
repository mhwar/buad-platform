import { sign, verify } from "hono/jwt";
import type { AuthUser } from "./service";

export const SESSION_COOKIE = "buad_session";
export const SESSION_TTL = 60 * 60 * 12; // 12h
const SETUP_TTL = 60 * 15;
const ALG = "HS256" as const;

const now = () => Math.floor(Date.now() / 1000);

export type Claims = {
  sub: string;
  org: string;
  role: string;
  v: number;
  kind: "session" | "setup";
  exp: number;
};

/** The secret must be configured; there is deliberately no fallback value. */
function need(secret: string | undefined): string {
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET is missing or too short");
  return secret;
}

export const signSession = (secret: string, u: AuthUser) =>
  sign(
    {
      sub: u.id,
      org: u.orgId,
      role: u.role,
      v: u.tokenVersion,
      kind: "session",
      exp: now() + SESSION_TTL,
    },
    need(secret),
    ALG,
  );

export const signSetup = (secret: string, u: AuthUser) =>
  sign(
    {
      sub: u.id,
      org: u.orgId,
      role: u.role,
      v: u.tokenVersion,
      kind: "setup",
      exp: now() + SETUP_TTL,
    },
    need(secret),
    ALG,
  );

async function verifyKind(
  secret: string,
  token: string,
  kind: Claims["kind"],
): Promise<Claims | null> {
  try {
    const claims = (await verify(token, need(secret), ALG)) as unknown as Claims;
    return claims.kind === kind ? claims : null;
  } catch {
    return null;
  }
}

export const verifySession = (secret: string, token: string) =>
  verifyKind(secret, token, "session");
export const verifySetup = (secret: string, token: string) => verifyKind(secret, token, "setup");
