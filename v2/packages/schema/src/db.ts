import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
  CATEGORY_TYPES,
  CLIENT_TYPES,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  FEE_BASES,
  FEE_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
} from "./enums";

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

/**
 * Finance settings of a project (v1 fin.ctrl). One row per project, created on first save.
 * Fee values are stored as typed: a percentage when *_type = pct, riyals when fixed.
 */
const fee = (name: string) => ({
  v: real(`${name}_v`).notNull().default(0),
  type: text(`${name}_type`, { enum: FEE_TYPES }).notNull().default("pct"),
  base: text(`${name}_base`, { enum: FEE_BASES }).notNull().default("net"),
});
const exec = fee("exec");
const mkt = fee("mkt");
const cb = fee("cb");
const cf = fee("cf");

export const projectFinance = sqliteTable("project_finance", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id),
  orgId: text("org_id")
    .notNull()
    .references(() => orgs.id),
  contractNo: text("contract_no").notNull().default(""),
  contractDate: text("contract_date").notNull().default(""),
  contractValue: integer("contract_value_halalas").notNull().default(0),
  cvLocked: integer("cv_locked", { mode: "boolean" }).notNull().default(false),
  vatIncluded: integer("vat_included", { mode: "boolean" }).notNull().default(false),
  vatPct: real("vat_pct").notNull().default(15),
  execV: exec.v,
  execType: exec.type,
  execBase: exec.base,
  mktV: mkt.v,
  mktType: mkt.type,
  mktBase: mkt.base,
  mktInternal: integer("mkt_internal", { mode: "boolean" }).notNull().default(false),
  cbV: cb.v,
  cbType: cb.type,
  cbBase: cb.base,
  cfV: cf.v,
  cfType: cf.type,
  cfBase: cf.base,
  /** JSON array of category keys counted as operating expenses; empty = v1 defaults. */
  opCats: text("op_cats").notNull().default("[]"),
  /** Optimistic locking: every save must name the version it started from. */
  version: integer("version").notNull().default(1),
  createdBy: audit.createdBy,
  createdAt: audit.createdAt,
  updatedBy: audit.updatedBy,
  updatedAt: audit.updatedAt,
});

export const financeEntries = sqliteTable(
  "finance_entries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    date: text("date").notNull().default(""),
    description: text("description").notNull(),
    /** Built-in key, `cc:<categoryId>`, or `bdg:<budgetItemId>`. */
    cat: text("cat").notNull().default("other"),
    type: text("type", { enum: ENTRY_TYPES }).notNull(),
    amount: integer("amount_halalas").notNull(),
    profitMargin: real("profit_margin").notNull().default(0),
    profitMarginType: text("profit_margin_type", { enum: FEE_TYPES }).notNull().default("pct"),
    status: text("status", { enum: ENTRY_STATUSES }).notNull().default(""),
    note: text("note").notNull().default(""),
    /** "agreement" = registered from the contract («من الاتفاقية»). */
    source: text("source", { enum: ["manual", "agreement"] })
      .notNull()
      .default("manual"),
    createdBy: audit.createdBy,
    createdAt: audit.createdAt,
    updatedBy: audit.updatedBy,
    updatedAt: audit.updatedAt,
  },
  (t) => [index("idx_entries_project").on(t.projectId, t.date)],
);

export const financeBudgetItems = sqliteTable(
  "finance_budget_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull().default(""),
    amount: integer("amount_halalas").notNull().default(0),
    note: text("note").notNull().default(""),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("idx_budget_project").on(t.projectId, t.sort)],
);

export const financeCategories = sqliteTable(
  "finance_categories",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    label: text("label").notNull(),
    type: text("type", { enum: CATEGORY_TYPES }).notNull().default("expense"),
  },
  (t) => [index("idx_categories_project").on(t.projectId)],
);
