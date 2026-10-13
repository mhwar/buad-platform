import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("bootstrap-owner emits SQL the API can verify, and never prints the password", () => {
  const password = "correct horse battery staple";
  const out = execFileSync(
    "npx",
    ["tsx", join(__dirname, "bootstrap-owner.ts"), "Owner@Example.com"],
    {
      env: { ...process.env, BOOTSTRAP_PASSWORD: password },
      encoding: "utf8",
    },
  );
  expect(out).not.toContain(password);
  const db = new Database(":memory:");
  const dir = join(__dirname, "../../../apps/api/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const s of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint"))
      if (s.trim()) db.exec(s);
  db.exec(out);
  const row = db.prepare("select email, role, password_hash h from users").get() as {
    email: string;
    role: string;
    h: string;
  };
  expect(row).toMatchObject({ email: "owner@example.com", role: "owner" });
  expect(row.h.startsWith("pbkdf2$100000$")).toBe(true);
});
