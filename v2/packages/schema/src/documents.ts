import { z } from "zod";

export const clauseSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().max(64).default(""),
  /** Display title (numbered titles are recomputed from baseTitle). */
  title: z.string().max(300).default(""),
  /** When set, the title is «المادة <ordinal>: baseTitle» and renumbers on reorder. */
  baseTitle: z.string().max(300).default(""),
  content: z.string().max(20000).default(""),
  pageBreak: z.boolean().default(false),
});
export type Clause = z.output<typeof clauseSchema>;

export const layoutSchema = z.object({
  fontSize: z.number().min(9).max(18).default(13),
  lineHeight: z.number().min(1).max(2.6).default(1.9),
  titleSize: z.number().min(12).max(28).default(20),
  clauseTitleSize: z.number().min(10).max(20).default(14),
  marginX: z.number().min(0.5).max(4).default(2.2),
  showHeader: z.boolean().default(true),
  showFooter: z.boolean().default(true),
  showSignatures: z.boolean().default(true),
  useOrgSignature: z.boolean().default(false),
  useOrgStamp: z.boolean().default(false),
  footerLabel: z.enum(["", "سري", "مسودة", "نسخة طبق الأصل", "نهائي"]).default(""),
});
export type DocLayout = z.output<typeof layoutSchema>;

export const createDocumentInput = z.object({
  kind: z.enum(["contract", "letter"]),
  /** Built-in key (service, nda, employment, consulting, blank, cashback, custom) or a custom template id. */
  template: z.string().min(1).max(64),
  title: z.string().trim().max(300).optional(),
});

export const documentPatch = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().max(300).optional(),
  number: z.string().trim().min(1).max(40).optional(),
  variables: z.record(z.string(), z.string().max(5000)).optional(),
  content: z.array(clauseSchema).max(200).optional(),
  layout: layoutSchema.partial().optional(),
});
export type DocumentPatch = z.input<typeof documentPatch>;

export const statusInput = z.object({
  to: z.enum(["draft", "review", "approved"]),
  version: z.number().int().min(1),
});

export const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  approved: "معتمد",
};
export const DOC_KIND_LABELS: Record<string, string> = { contract: "عقد", letter: "خطاب" };
