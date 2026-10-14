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
  DISTRIBUTION_STATUSES,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  FEE_BASES,
  FEE_TYPES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  RETAINED_CATS,
} from "./enums";
import { PRODUCT_STATUSES } from "./products";

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
    /**
     * Purchase with a tax invoice: the VAT in it is claimable and appears in the VAT report.
     * Independent of profit_margin (the old «استخراج 13.043%» button), which is left alone.
     */
    taxInvoice: integer("tax_invoice", { mode: "boolean" }).notNull().default(false),
    vatAmount: integer("vat_amount_halalas").notNull().default(0),
    supplierName: text("supplier_name").notNull().default(""),
    supplierVatNo: text("supplier_vat_no").notNull().default(""),
    invoiceNo: text("invoice_no").notNull().default(""),
    invoiceDate: text("invoice_date").notNull().default(""),
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

/** Organisation identity used by documents (v1 settings company_* + logo, stamp, signature, letterhead). */
export const orgProfile = sqliteTable("org_profile", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => orgs.id),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  address: text("address").notNull().default(""),
  reg: text("reg").notNull().default(""),
  tax: text("tax").notNull().default(""),
  signerName: text("signer_name").notNull().default(""),
  signerTitle: text("signer_title").notNull().default(""),
  signerId: text("signer_id").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  bankIban: text("bank_iban").notNull().default(""),
  /** Asset ids (see `assets`). */
  logoAsset: text("logo_asset").notNull().default(""),
  stampAsset: text("stamp_asset").notNull().default(""),
  signatureAsset: text("signature_asset").notNull().default(""),
  headerAsset: text("header_asset").notNull().default(""),
  footerAsset: text("footer_asset").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(now),
});

/** Files kept in R2, one row per distinct content per org (deduplicated by sha256). */
export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    r2Key: text("r2_key").notNull(),
    createdBy: text("created_by").notNull().default(""),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("uq_assets_hash").on(t.orgId, t.sha256)],
);

export const DOC_KINDS = ["contract", "letter"] as const;
export const DOC_STATUSES = ["draft", "review", "approved"] as const;

/** Organisation's own contract templates (built-in ones live in code). */
export const docTemplates = sqliteTable(
  "doc_templates",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: DOC_KINDS }).notNull().default("contract"),
    /** JSON: { clauses, customVars, layout } */
    body: text("body").notNull().default("{}"),
    ...audit,
  },
  (t) => [index("idx_templates_org").on(t.orgId)],
);

/** Contracts and letters of a project. Content is JSON; numbers are per org and year. */
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    kind: text("kind", { enum: DOC_KINDS }).notNull(),
    number: text("number").notNull(),
    title: text("title").notNull().default(""),
    templateKey: text("template_key").notNull().default(""),
    status: text("status", { enum: DOC_STATUSES }).notNull().default("draft"),
    /** JSON: variable values as edited. */
    variables: text("variables").notNull().default("{}"),
    /** JSON: [{ id, key, title, content, pageBreak }] for contracts; letters keep their body here. */
    content: text("content").notNull().default("[]"),
    /** JSON: style, margins, cover, header/footer bands. */
    layout: text("layout").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    approvedBy: text("approved_by").notNull().default(""),
    approvedAt: integer("approved_at"),
    /** Outgoing (صادر) register number, given on request after approval; never reused. */
    outgoingNo: text("outgoing_no").notNull().default(""),
    outgoingAt: integer("outgoing_at"),
    outgoingBy: text("outgoing_by").notNull().default(""),
    ...audit,
  },
  (t) => [
    uniqueIndex("uq_documents_number").on(t.orgId, t.number),
    uniqueIndex("uq_documents_outgoing").on(t.orgId, t.outgoingNo).where(sql`outgoing_no <> ''`),
    index("idx_documents_project").on(t.projectId, t.kind),
  ],
);

/** Immutable snapshot of a document at each approval. */
export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    version: integer("version").notNull(),
    snapshot: text("snapshot").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: integer("approved_at").notNull(),
  },
  (t) => [index("idx_versions_document").on(t.documentId)],
);

/**
 * A link that lets someone outside the platform open one approved document (read-only, with
 * download). Only the token's hash is kept; the link expires and can be revoked.
 */
export const documentShares = sqliteTable(
  "document_shares",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    tokenHash: text("token_hash").notNull(),
    channel: text("channel").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    views: integer("views").notNull().default(0),
    lastViewedAt: integer("last_viewed_at"),
  },
  (t) => [
    uniqueIndex("uq_document_shares_token").on(t.tokenHash),
    index("idx_document_shares_document").on(t.documentId),
  ],
);

/* ── Company finance («مالية الشركة»): money not tied to one project ─────────── */

/** Company income (services, subscriptions…) and expenses (hosting, payroll…). */
export const companyEntries = sqliteTable(
  "company_entries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    category: text("category").notNull().default("other"),
    date: text("date").notNull().default(""),
    /** Income only: when the money reached the bank (decides its quarter, as in v1). */
    paymentDate: text("payment_date").notNull().default(""),
    description: text("description").notNull(),
    amount: integer("amount_halalas").notNull(),
    note: text("note").notNull().default(""),
    ...audit,
  },
  (t) => [index("idx_company_entries_org").on(t.orgId, t.type, t.date)],
);

/** Partners and their share of distributed profit. */
export const partners = sqliteTable(
  "partners",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    name: text("name").notNull(),
    /** Percent, e.g. 33.33. */
    sharePct: real("share_pct").notNull().default(0),
    note: text("note").notNull().default(""),
    ...audit,
  },
  (t) => [index("idx_partners_org").on(t.orgId)],
);

/** A profit distribution: a draft until completed, then frozen (shares are copied). */
export const distributions = sqliteTable(
  "distributions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    periodType: text("period_type").notNull().default("quarter"),
    periodLabel: text("period_label").notNull().default(""),
    fromDate: text("from_date").notNull().default(""),
    toDate: text("to_date").notNull().default(""),
    grossIncome: integer("gross_income_halalas").notNull().default(0),
    grossExpenses: integer("gross_expenses_halalas").notNull().default(0),
    netProfit: integer("net_profit_halalas").notNull().default(0),
    distributionPct: real("distribution_pct").notNull().default(100),
    distributedAmount: integer("distributed_halalas").notNull().default(0),
    retainedAmount: integer("retained_halalas").notNull().default(0),
    retainedCategory: text("retained_category", { enum: RETAINED_CATS }),
    /** JSON array of project ids the distribution covers. */
    projectIds: text("project_ids").notNull().default("[]"),
    /** A single-project distribution («توزيع أرباح هذا المشروع»). */
    projectId: text("project_id").notNull().default(""),
    status: text("status", { enum: DISTRIBUTION_STATUSES }).notNull().default("draft"),
    note: text("note").notNull().default(""),
    completedAt: integer("completed_at"),
    ...audit,
  },
  (t) => [index("idx_distributions_org").on(t.orgId, t.status)],
);

export const distributionShares = sqliteTable(
  "distribution_shares",
  {
    id: text("id").primaryKey(),
    distributionId: text("distribution_id")
      .notNull()
      .references(() => distributions.id),
    partnerId: text("partner_id").notNull().default(""),
    partnerName: text("partner_name").notNull(),
    sharePct: real("share_pct").notNull(),
    amount: integer("amount_halalas").notNull(),
  },
  (t) => [index("idx_distribution_shares").on(t.distributionId)],
);

/** Money received from the client for a project (instalments; a negative amount is a refund). */
export const projectReceipts = sqliteTable(
  "project_receipts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    date: text("date").notNull(),
    amount: integer("amount_halalas").notNull(),
    note: text("note").notNull().default(""),
    /** Where the date came from (e.g. «من تاريخ الاستلام في المنصة القديمة»), kept with the approval. */
    basis: text("basis").notNull().default(""),
    /** A receipt exists only once someone verified and approved it. */
    approvedBy: text("approved_by").notNull().default(""),
    approvedAt: integer("approved_at"),
    ...audit,
  },
  (t) => [index("idx_receipts_project").on(t.projectId, t.date)],
);

/** How much of each project's profit a completed distribution paid out (never twice). */
export const distributionProjects = sqliteTable(
  "distribution_projects",
  {
    id: text("id").primaryKey(),
    distributionId: text("distribution_id")
      .notNull()
      .references(() => distributions.id),
    projectId: text("project_id").notNull(),
    amount: integer("amount_halalas").notNull(),
  },
  (t) => [
    index("idx_distribution_projects_d").on(t.distributionId),
    index("idx_distribution_projects_p").on(t.projectId),
  ],
);

/** The organisation's VAT settings (rate for new purchases, reporting period). */
export const orgVatSettings = sqliteTable("org_vat_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => orgs.id),
  /** Percent. Applied to NEW purchases only: stored VAT never changes when it is edited. */
  rate: real("rate").notNull().default(15),
  period: text("period", { enum: ["quarterly", "monthly"] })
    .notNull()
    .default("quarterly"),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(now),
});

/**
 * «المنتجات والخدمات»: an offer the org sells (e.g. patient transport). `content` (JSON text) is
 * what may be shown publicly; `pricing` (JSON text: costs, margins) is private and never leaves
 * the platform.
 */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("draft"),
    /** Listed on the public website (only when status = published). */
    showOnSite: integer("show_on_site", { mode: "boolean" }).notNull().default(false),
    content: text("content").notNull().default("{}"),
    pricing: text("pricing").notNull().default("{}"),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull().default(""),
    createdAt: integer("created_at").notNull().default(now),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("uq_products_slug").on(t.orgId, t.slug),
    index("idx_products_org").on(t.orgId, t.status),
  ],
);
