import { z } from "zod";

/* ─────────────────────────────────────────────────────────────────────────────
 * «المنتجات والخدمات»: a product is a structured offer (what it is, packages, how it runs, what
 * the client gets) plus a private pricing model. `content` is public-safe (it can appear on the
 * website); `pricing` (costs, margins) NEVER leaves the platform.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PRODUCT_STATUSES = ["draft", "published", "archived"] as const;
export const REQUEST_STATUSES = [
  "new",
  "contacted",
  "quoted",
  "negotiating",
  "won",
  "lost",
] as const;

/** A small whitelist: content stores a name, the UI draws the glyph. */
export const PRODUCT_ICONS = [
  "clock",
  "globe",
  "alert",
  "settings",
  "home",
  "car",
  "lock",
  "users",
  "check",
  "chart",
  "book",
  "pulse",
  "chat",
  "badge",
  "briefcase",
  "code",
  "megaphone",
  "truck",
] as const;
export const iconSchema = z.enum(PRODUCT_ICONS);

export const COST_UNITS = ["trip", "night", "person", "month", "project", "fixed"] as const;
export type CostUnit = (typeof COST_UNITS)[number];

const str = (max: number) => z.string().trim().max(max).default("");
const list = <T extends z.ZodType>(item: T, max = 30) => z.array(item).max(max).default([]);

const item = z.object({ title: str(140), text: str(700), icon: iconSchema.optional() });
export type ContentItem = z.infer<typeof item>;

export const intakeQuestion = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "number", "select", "multi"]).default("text"),
  options: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  required: z.boolean().default(false),
});
export type IntakeQuestion = z.infer<typeof intakeQuestion>;

export const productPackage = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(80),
  audience: str(300),
  features: list(z.string().trim().min(1).max(200), 12),
  highlight: z.boolean().default(false),
});
export type ProductPackage = z.infer<typeof productPackage>;

export const productContent = z.object({
  hero: z
    .object({
      eyebrow: str(80),
      title: str(160),
      subtitle: str(500),
      tags: list(z.string().trim().min(1).max(40), 6),
      /** A cover photo for the service (uploaded asset id). */
      imageAsset: str(60),
    })
    .default({ eyebrow: "", title: "", subtitle: "", tags: [], imageAsset: "" }),
  problems: list(item, 8),
  offerings: list(
    z.object({
      title: str(100),
      icon: iconSchema.optional(),
      points: list(z.string().max(200), 8),
    }),
    6,
  ),
  model: list(item, 8),
  benefits: list(item, 8),
  comparison: list(z.object({ label: str(100), self: str(200), us: str(200) }), 10),
  packages: list(productPackage, 6),
  process: list(item, 8),
  roles: z
    .object({ client: list(z.string().max(200), 8), us: list(z.string().max(200), 8) })
    .default({ client: [], us: [] }),
  standards: list(item, 8),
  deliverables: list(item, 8),
  proof: list(
    z.object({
      title: str(120),
      entity: str(120),
      beneficiaries: str(40),
      text: str(500),
      scope: list(z.string().max(160), 8),
    }),
    6,
  ),
  intake: list(intakeQuestion, 12),
  /** Offer the service profile (PDF) for download on the public product page. */
  brochure: z.boolean().default(true),
  /** Not launched yet: shown as «قريباً» and collects interest instead of quote requests. */
  comingSoon: z.boolean().default(false),
  faq: list(z.object({ q: str(200), a: str(900) }), 12),
});
export type ProductContent = z.infer<typeof productContent>;

/** Pricing model. Amounts are riyals (a planning tool, not a ledger); the engine rounds to halalas. */
export const costLine = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,40}$/),
  label: z.string().trim().min(1).max(120),
  unit: z.enum(COST_UNITS),
  cost: z.coerce.number().min(0).max(100_000_000).default(0),
  note: str(200),
});
export type CostLine = z.infer<typeof costLine>;

export const pricingModel = z.object({
  method: z.enum(["margin", "markup", "fixed"]).default("margin"),
  /** Percent, for margin and markup. */
  value: z.coerce.number().min(0).max(1000).default(0),
  lines: z.array(costLine).max(30).default([]),
  /** Typical quantities of each cost line inside a package (and a fixed price when method = fixed). */
  packages: z
    .array(
      z.object({
        packageId: z.string().max(40),
        qty: z.record(z.string().max(40), z.coerce.number().min(0).max(1_000_000)).default({}),
        fixedPrice: z.coerce.number().min(0).max(100_000_000).default(0),
      }),
    )
    .max(6)
    .default([]),
});
export type PricingModel = z.infer<typeof pricingModel>;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(60);

export const productCreate = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  tagline: str(240).optional(),
});
export type ProductCreate = z.infer<typeof productCreate>;

export const productPatch = z
  .object({
    version: z.number().int().min(1),
    name: z.string().trim().min(1).max(120),
    slug,
    // No default here: an update that omits the tagline must keep it.
    tagline: z.string().trim().max(240),
    status: z.enum(PRODUCT_STATUSES),
    showOnSite: z.boolean(),
    content: productContent,
    pricing: pricingModel,
  })
  .partial()
  .required({ version: true });
export type ProductPatch = z.infer<typeof productPatch>;

/** Public quote request (from the website) and manual entry by staff. */
export const requestInput = z.object({
  productSlug: z.string().trim().max(60).optional(),
  name: z.string().trim().min(2).max(100),
  entity: z.string().trim().max(160).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.union([z.literal(""), z.email().max(160)]).default(""),
  message: z.string().trim().max(2000).default(""),
  answers: z.record(z.string().max(40), z.string().max(500)).default({}),
  /** Honeypot: real people never fill it. */
  website: z.string().max(200).optional(),
});
export type RequestInput = z.infer<typeof requestInput>;

const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

/** A new opportunity logged by staff: for an existing client, a new one, or (old way) contact details only. */
export const opportunityInput = z.object({
  clientId: z.string().max(60).default(""),
  /** Create the client from `entity` (or the contact's name) in the same step. */
  newClient: z.boolean().default(false),
  /** Seen the «similar name» warning and still want a new client. */
  confirmSimilarName: z.boolean().default(false),
  name: z.string().trim().max(100).default(""),
  entity: z.string().trim().max(160).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.union([z.literal(""), z.email().max(160)]).default(""),
  message: z.string().trim().max(2000).default(""),
  answers: z.record(z.string().max(40), z.string().max(500)).default({}),
  productId: z.string().max(60).default(""),
  /** Older form: the service by its slug. */
  productSlug: z.string().trim().max(60).optional(),
  packageId: z.string().max(60).default(""),
  /** Expected value in riyals. */
  value: z.number().min(0).max(1_000_000_000).default(0),
  ownerId: z.string().max(60).default(""),
  followUpAt: day.default(""),
});
export type OpportunityInput = z.infer<typeof opportunityInput>;

export const requestPatch = z
  .object({
    status: z.enum(REQUEST_STATUSES),
    notes: z.string().trim().max(2000),
    ownerId: z.string().max(60),
    followUpAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    /** The expected deal value in riyals. */
    value: z.number().min(0).max(1_000_000_000),
    lostReason: z.string().trim().max(300),
    productId: z.string().max(60),
    packageId: z.string().max(60),
  })
  .partial();
