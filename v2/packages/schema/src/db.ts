import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { CLIENT_TYPES, PROJECT_STATUSES, PROJECT_TYPES } from "./enums";

export { CLIENT_TYPES, PROJECT_STATUSES, PROJECT_TYPES };

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

/** Per-org sequential counters (client codes, yearly project numbers). Bumped by one atomic UPSERT. */
export const orgCounters = sqliteTable(
  "org_counters",
  {
    orgId: text("org_id").notNull(),
    kind: text("kind").notNull(),
    year: integer("year").notNull().default(0),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.kind, t.year] })],
);

const audit = {
  createdBy: text("created_by").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(now),
  /** Archive instead of delete: null = live. */
  archivedAt: integer("archived_at"),
};

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Lower-cased, whitespace/diacritics-folded name for duplicate warnings. */
    nameNorm: text("name_norm").notNull().default(""),
    type: text("type", { enum: CLIENT_TYPES }).notNull().default("company"),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    city: text("city").notNull().default(""),
    regNo: text("reg_no").notNull().default(""),
    taxNo: text("tax_no").notNull().default(""),
    address: text("address").notNull().default(""),
    website: text("website").notNull().default(""),
    notes: text("notes").notNull().default(""),
    logo: text("logo").notNull().default(""),
    ...audit,
  },
  (t) => [
    uniqueIndex("uq_clients_code").on(t.orgId, t.code),
    uniqueIndex("uq_clients_reg").on(t.orgId, t.regNo).where(sql`reg_no <> ''`),
    uniqueIndex("uq_clients_tax").on(t.orgId, t.taxNo).where(sql`tax_no <> ''`),
    index("idx_clients_org").on(t.orgId, t.archivedAt),
  ],
);

export const clientContacts = sqliteTable(
  "client_contacts",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull().default(""),
    title: text("title").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    /** The authorised signatory (v1: contact_name / contact_title). At most one per client. */
    isSignatory: integer("is_signatory", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("idx_contacts_client").on(t.clientId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    number: text("number").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: PROJECT_TYPES }).notNull().default("other"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    ownerId: text("owner_id").notNull().default(""),
    visibility: text("visibility", { enum: ["team", "private"] })
      .notNull()
      .default("team"),
    location: text("location").notNull().default(""),
    startDate: text("start_date").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    payDate: text("pay_date").notNull().default(""),
    /** «قيمة العقد المتوقعة» in halalas. Finance module takes over the real contract value. */
    expectedValue: integer("expected_value_halalas").notNull().default(0),
    notes: text("notes").notNull().default(""),
    ...audit,
    /** Set to the client id when the project was archived together with its client. */
    archivedWith: text("archived_with").notNull().default(""),
  },
  (t) => [
    uniqueIndex("uq_projects_number").on(t.orgId, t.number),
    index("idx_projects_client").on(t.orgId, t.clientId),
    index("idx_projects_status").on(t.orgId, t.status),
  ],
);
