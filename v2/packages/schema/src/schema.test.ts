import { describe, expect, it } from "vitest";
import { loginInput } from "./index";

describe("schemas", () => {
  it("validates login input", () => {
    expect(loginInput.safeParse({ email: "a@b.sa", password: "12345678" }).success).toBe(true);
    expect(loginInput.safeParse({ email: "nope", password: "12345678" }).success).toBe(false);
    expect(loginInput.safeParse({ email: "a@b.sa", password: "" }).success).toBe(false);
    // Legacy v1 passwords may be short; length rules apply only when setting a password.
    expect(loginInput.safeParse({ email: "a@b.sa", password: "abc123" }).success).toBe(true);
  });
});
