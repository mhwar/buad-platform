import { z } from "zod";
import { CLIENT_TYPES, PROJECT_STATUSES, PROJECT_TYPES } from "./enums";

export { BUILTIN_CATEGORIES } from "./enums";

/*
 * Field definitions WITHOUT defaults. Create schemas add defaults; patch schemas must not
 * (a default inside a partial would silently blank every field the client did not send).
 */
const str = (max = 200) => z.string().trim().max(max);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => v === "" || z.email().safeParse(v).success, "invalid_email");
const date = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid_date");
/** Logos are small images kept inline until the documents module moves them to R2. */
const MAX_LOGO_CHARS = 280_000; // ≈ 200 KB of image data in base64
const logo = z
  .string()
  .max(MAX_LOGO_CHARS, "logo_too_large")
  .refine(
    (v) => v === "" || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v),
    "invalid_logo",
  );

export const contactInput = z.object({
  name: str().default(""),
  title: str().default(""),
  phone: str(40).default(""),
  email: email.default(""),
  isSignatory: z.boolean().default(false),
});

const clientFields = {
  name: z.string().trim().min(1, "required").max(200),
  type: z.enum(CLIENT_TYPES),
  email,
  phone: str(40),
  city: str(100),
  regNo: str(40),
  taxNo: str(40),
  address: str(300),
  website: str(300),
  notes: str(5000),
  logo,
  /** v1's single authorised signatory, shown on the form exactly as before. */
  signatoryName: str(),
  signatoryTitle: str(),
  /** Other contact people (optional). */
  contacts: z.array(contactInput).max(20),
};

export const clientInput = z.object({
  ...clientFields,
  type: clientFields.type.default("company"),
  email: email.default(""),
  phone: str(40).default(""),
  city: str(100).default(""),
  regNo: str(40).default(""),
  taxNo: str(40).default(""),
  address: str(300).default(""),
  website: str(300).default(""),
  notes: str(5000).default(""),
  logo: logo.default(""),
  signatoryName: str().default(""),
  signatoryTitle: str().default(""),
  contacts: clientFields.contacts.default([]),
  /** Set when the user has seen the "similar name" warning and wants to continue. */
  confirmSimilarName: z.boolean().default(false),
});
export type ClientInput = z.input<typeof clientInput>;
export const clientPatch = z
  .object(clientFields)
  .partial()
  .extend({ confirmSimilarName: z.boolean().default(false) });

const projectFields = {
  clientId: z.string().min(1, "required"),
  name: z.string().trim().min(1, "required").max(200),
  type: z.enum(PROJECT_TYPES),
  status: z.enum(PROJECT_STATUSES),
  visibility: z.enum(["team", "private"]),
  location: str(200),
  startDate: date,
  endDate: date,
  payDate: date,
  /** Riyals as typed by the user; stored as integer halalas. */
  expectedValue: z.coerce.number().min(0).max(1e12),
  notes: str(5000),
  /** The service (product) and package this project was contracted on; both optional. */
  productId: z.string().max(60),
  packageId: z.string().max(40),
};

export const projectInput = z
  .object({
    ...projectFields,
    type: projectFields.type.default("other"),
    status: projectFields.status.default("active"),
    visibility: projectFields.visibility.default("team"),
    location: str(200).default(""),
    startDate: date.default(""),
    endDate: date.default(""),
    payDate: date.default(""),
    expectedValue: projectFields.expectedValue.default(0),
    notes: str(5000).default(""),
    productId: projectFields.productId.default(""),
    packageId: projectFields.packageId.default(""),
  })
  .refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, {
    path: ["endDate"],
    message: "end_before_start",
  });
export type ProjectInput = z.input<typeof projectInput>;
export const projectPatch = z.object(projectFields).partial();

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  clientId: z.string().optional(),
  product: z.string().max(60).optional(),
  sort: z.enum(["newest", "name", "value", "contact", "deadline"]).default("newest"),
  /** Projects needing attention: running past their end date, or with an instalment overdue. */
  flag: z.enum(["late", "due"]).optional(),
  archived: z.enum(["0", "1"]).default("0"),
  /** CRM filters: "me" or a user id; a relationship; a source; a tag; follow-ups that are due. */
  owner: z.string().max(60).optional(),
  rel: z.enum(["active", "prospect", "former", "dormant", "new"]).optional(),
  source: z.string().max(20).optional(),
  tag: z.string().max(40).optional(),
  followup: z.enum(["due"]).optional(),
});

/** Arabic labels, identical to v1 (app.html L3756–3771). */
export const CLIENT_TYPE_LABELS: Record<(typeof CLIENT_TYPES)[number], string> = {
  company: "شركة",
  association: "جمعية",
  government: "جهة حكومية",
  individual: "فرد",
  other: "أخرى",
};
export const PROJECT_TYPE_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  training: "تدريب",
  consulting: "استشارات",
  event: "فعالية",
  other: "أخرى",
};
export const PROJECT_STATUS_LABELS: Record<(typeof PROJECT_STATUSES)[number], string> = {
  draft: "مسودة",
  active: "جاري التنفيذ",
  completed: "مكتمل",
  paused: "متوقف",
  cancelled: "ملغي",
};
