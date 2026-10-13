import { healthResponse } from "@buad/schema";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

export type Env = { APP_VERSION: string };

export const app = new Hono<{ Bindings: Env }>()
  .use(secureHeaders())
  .get("/api/health", (c) =>
    c.json(healthResponse.parse({ ok: true, service: "buad-v2-api", version: c.env.APP_VERSION })),
  )
  .onError((err, c) => {
    console.error(err);
    return c.json({ ok: false, error: "internal_error" }, 500);
  })
  .notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

export type AppType = typeof app;
