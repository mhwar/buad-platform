#!/usr/bin/env tsx
/**
 * Creates the first platform owner. YOU choose the password; it never leaves your machine.
 *
 *   BOOTSTRAP_PASSWORD='your-long-password' pnpm --filter @buad/migrate bootstrap-owner you@example.com > owner.sql
 *   cd ../../apps/api && pnpm exec wrangler d1 execute buad-v2 --remote --file ../../tools/migrate/owner.sql
 *
 * Prints SQL only (a PBKDF2 hash, never the password). Safe to run once; re-running fails on the unique email.
 */
const email = process.argv[2]?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_PASSWORD;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("usage: BOOTSTRAP_PASSWORD=… bootstrap-owner <email>");
  process.exit(2);
}
if (!password || password.length < 12) {
  console.error("BOOTSTRAP_PASSWORD must be set and at least 12 characters");
  process.exit(2);
}

const ITERATIONS = 100_000; // Workers' PBKDF2 maximum
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const bits = new Uint8Array(
  await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  ),
);
const hash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(bits)}`;
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

console.log(`INSERT OR IGNORE INTO orgs (id, name) VALUES ('org_platform', 'بُعد');`);
console.log(
  `INSERT INTO users (id, org_id, email, name, role, password_hash) VALUES ('usr_owner_1', 'org_platform', ${q(email)}, 'مالك المنصة', 'owner', ${q(hash)});`,
);

export {};
