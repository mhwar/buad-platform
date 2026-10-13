import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
export const legacyMap = sqliteTable("legacy_map", {
  kind: text("kind").notNull(),
  legacyId: text("legacy_id").notNull(),
  newId: text("new_id").notNull(),
  importedAt: integer("imported_at").notNull().default(now),
});
