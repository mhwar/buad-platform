import { describe, expect, it } from "vitest";
import { app } from "./app";

const env = { APP_VERSION: "test", JWT_SECRET: "x".repeat(20) };

describe("api", () => {
  it("answers /api/health", async () => {
    const res = await app.request("/api/health", {}, env as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "buad-v2-api", version: "test" });
  });

  it("returns json 404", async () => {
    const res = await app.request("/api/nope", {}, env as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });
});
