import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/** Associations / client organisations. One row per tenant. */
export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull().default(now),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    email: text("email").notNull().unique(),
    name: text("name").notNull().default(""),
    /** PBKDF2 hash ("pbkdf2$iterations$salt$hash"); empty until the user sets a password. */
    passwordHash: text("password_hash").notNull().default(""),
    /** v1 djb2 hash, kept only to verify the first v2 login and then cleared (upgrade-on-login). */
    legacyHash: text("legacy_hash").notNull().default(""),
    mustChangePass: integer("must_change_pass", { mode: "boolean" }).notNull().default(false),
    /** Bumped on password change/logout-all; tokens carrying an older value are rejected. */
    tokenVersion: integer("token_version").notNull().default(0),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("idx_users_org").on(t.orgId)],
);

/**
 * Records imported from v1 keep their original id so every migration run is
 * idempotent and every v2 row can be traced back to its v1 source.
 */
export const legacyMap = sqliteTable(
  "legacy_map",
  {
    kind: text("kind").notNull(),
    legacyId: text("legacy_id").notNull(),
    newId: text("new_id").notNull(),
    importedAt: integer("imported_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.kind, t.legacyId] })],
);
