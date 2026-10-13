import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Db } from "./auth/service";

/** A fresh in-memory SQLite with the real generated migrations applied. */
export function testDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON"); // D1 enforces foreign keys; tests must too
  const dir = join(__dirname, "../migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) sqlite.exec(stmt);
    }
  }
  return { sqlite, db: drizzle(sqlite) as unknown as Db };
}
