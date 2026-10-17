import { PROJECT_STATUS_LABELS } from "@buad/schema/clients";
import {
  auditLog,
  companyEntries,
  distributions,
  documents,
  financeEntries,
  paymentSchedule,
  projectFinance,
  projectReceipts,
  projects,
} from "@buad/schema/db";
import { DOC_STATUS_LABELS } from "@buad/schema/documents";
import { auditQuery } from "@buad/schema/team";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { requireAuth, requirePerm, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { newId, nowSec } from "./common";

type Who = { id: string; orgId: string; name: string };

/**
 * Records who did what. Never throws into the caller: losing a log line must not undo the
 * change the person just made.
 */
export async function audit(
  db: Db,
  me: Who,
  e: { entity: string; entityId?: string; action: string; summary: string; detail?: unknown },
) {
  try {
    await db.insert(auditLog).values({
      id: newId("aud"),
      orgId: me.orgId,
      at: nowSec(),
      userId: me.id,
      userName: me.name,
      entity: e.entity,
      entityId: e.entityId ?? "",
      action: e.action,
      summary: e.summary,
      detail: JSON.stringify(e.detail ?? {}),
    });
  } catch (err) {
    console.error("audit_failed", err);
  }
}

const dayStart = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000);

export const auditApp = new Hono<{ Variables: Vars }>()
  .use(requireAuth)
  .use(requirePerm("audit.view"))
  .get("/", zValidator("query", auditQuery), async (c) => {
    const me = c.get("user");
    const q = c.req.valid("query");
    const where = and(
      eq(auditLog.orgId, me.orgId),
      q.entity ? eq(auditLog.entity, q.entity) : undefined,
      q.user ? eq(auditLog.userId, q.user) : undefined,
      q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? gte(auditLog.at, dayStart(q.from)) : undefined,
      q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)
        ? lte(auditLog.at, dayStart(q.to) + 86399)
        : undefined,
      q.before ? lt(auditLog.at, q.before) : undefined,
    );
    const rows = await c
      .get("db")
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(q.limit);
    return c.json({
      ok: true,
      items: rows.map((r) => ({ ...r, detail: safe(r.detail) })),
    });
  });

function safe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Route → what it changes, in the words the owner reads in the trail. */
const TRAIL: { re: RegExp; entity: string; noun: string }[] = [
  { re: /^\/api\/projects\/([^/]+)\/finance\/receipts/, entity: "project", noun: "مقبوضة" },
  { re: /^\/api\/projects\/([^/]+)\/finance\/entries/, entity: "project", noun: "حركة مالية" },
  { re: /^\/api\/projects\/([^/]+)\/finance/, entity: "project", noun: "مالية المشروع" },
  { re: /^\/api\/projects\/([^/]+)\/documents/, entity: "project", noun: "مستند" },
  { re: /^\/api\/documents\/([^/]+)\/shares/, entity: "document", noun: "رابط مشاركة" },
  { re: /^\/api\/documents\/?([^/]*)/, entity: "document", noun: "مستند" },
  { re: /^\/api\/projects\/?([^/]*)/, entity: "project", noun: "مشروع" },
  { re: /^\/api\/clients\/?([^/]*)/, entity: "client", noun: "عميل" },
  { re: /^\/api\/finance\/company/, entity: "company", noun: "مالية الشركة" },
  { re: /^\/api\/finance\/vat/, entity: "vat", noun: "إعدادات الضريبة" },
  { re: /^\/api\/products\/?([^/]*)/, entity: "product", noun: "منتج أو خدمة" },
  { re: /^\/api\/product-requests\/?([^/]*)/, entity: "request", noun: "طلب" },
  { re: /^\/api\/tasks\/projects\/([^/]+)/, entity: "project", noun: "مراحل المشروع" },
  { re: /^\/api\/tasks/, entity: "task", noun: "مهمة" },
  { re: /^\/api\/receivables\/?[^/]*\/?([^/]*)/, entity: "project", noun: "جدول الدفعات" },
  { re: /^\/api\/crm\/clients\/([^/]+)/, entity: "client", noun: "متابعة العميل" },
  { re: /^\/api\/quotes\/?([^/]*)/, entity: "quote", noun: "عرض سعر" },
  { re: /^\/api\/meetings\/?([^/]*)/, entity: "meeting", noun: "اجتماع" },
  { re: /^\/api\/decisions\/?([^/]*)/, entity: "decision", noun: "قرار" },
  { re: /^\/api\/plans/, entity: "plan", noun: "الخطط" },
  { re: /^\/api\/site/, entity: "site", noun: "الموقع" },
  { re: /^\/api\/org\/settings/, entity: "org", noun: "الإعدادات المالية" },
  { re: /^\/api\/org/, entity: "org", noun: "بيانات المنشأة" },
  { re: /^\/api\/assets/, entity: "asset", noun: "ملف" },
  { re: /^\/api\/import/, entity: "import", noun: "استيراد" },
];
const VERBS: Record<string, string> = {
  archive: "أرشفة",
  restore: "استعادة",
  status: "تغيير حالة",
  outgoing: "تسجيل صادر",
  duplicate: "نسخ",
  publish: "نشر",
  approve: "اعتماد",
};

/* ── Money and its paperwork: what a change did, field by field ─────────────────────────
 * For these records the trail keeps the values before and after (an amount edited from
 * 50,000 to 5,000 reads exactly so), and what was entered when one is created. */
type Field = { label: string; kind?: "money" | "bool" | "status" };
type Watch = {
  re: RegExp;
  table: any;
  /** The column the id from the path matches. */
  by: "id" | "projectId";
  fields: Record<string, Field>;
};
const MONEY: Field = { label: "المبلغ", kind: "money" };
const WATCH: Watch[] = [
  {
    re: /^\/api\/projects\/[^/]+\/finance\/receipts\/([^/]+)$/,
    table: projectReceipts,
    by: "id",
    fields: { date: { label: "التاريخ" }, amount: MONEY, note: { label: "الملاحظة" } },
  },
  {
    re: /^\/api\/projects\/[^/]+\/finance\/entries\/([^/]+)$/,
    table: financeEntries,
    by: "id",
    fields: {
      date: { label: "التاريخ" },
      description: { label: "البيان" },
      type: { label: "النوع" },
      amount: MONEY,
      status: { label: "الحالة" },
    },
  },
  {
    re: /^\/api\/projects\/([^/]+)\/finance\/ctrl$/,
    table: projectFinance,
    by: "projectId",
    fields: {
      contractNo: { label: "رقم العقد" },
      contractDate: { label: "تاريخ العقد" },
      contractValue: { label: "قيمة العقد", kind: "money" },
      vatIncluded: { label: "شاملة الضريبة", kind: "bool" },
      vatPct: { label: "نسبة الضريبة" },
    },
  },
  {
    re: /^\/api\/receivables\/([^/]+)(?:\/receive)?$/,
    table: paymentSchedule,
    by: "id",
    fields: {
      label: { label: "الدفعة" },
      dueDate: { label: "الاستحقاق" },
      amount: MONEY,
      status: { label: "الحالة" },
    },
  },
  {
    re: /^\/api\/projects\/([^/]+)$/,
    table: projects,
    by: "id",
    fields: {
      name: { label: "الاسم" },
      status: { label: "الحالة", kind: "status" },
      expectedValue: { label: "القيمة المتوقعة", kind: "money" },
    },
  },
  {
    re: /^\/api\/finance\/company\/entries\/([^/]+)(?:\/restore)?$/,
    table: companyEntries,
    by: "id",
    fields: {
      date: { label: "التاريخ" },
      description: { label: "البيان" },
      type: { label: "النوع" },
      amount: MONEY,
    },
  },
  {
    re: /^\/api\/documents\/([^/]+)\/(?:status|outgoing)$/,
    table: documents,
    by: "id",
    fields: { status: { label: "الحالة", kind: "status" }, outgoingNo: { label: "رقم الصادر" } },
  },
  {
    re: /^\/api\/finance\/company\/distributions\/([^/]+)(?:\/complete)?$/,
    table: distributions,
    by: "id",
    fields: {
      periodLabel: { label: "الفترة" },
      status: { label: "الحالة" },
      distributedAmount: { label: "الموزَّع", kind: "money" },
    },
  },
];
/** Creating one of these: the trail keeps what was entered (amounts arrive in riyals). */
const CREATE: { re: RegExp; fields: Record<string, Field> }[] = [
  {
    re: /^\/api\/projects\/[^/]+\/finance\/(?:receipts|entries)$/,
    fields: {
      date: { label: "التاريخ" },
      description: { label: "البيان" },
      amount: MONEY,
      note: { label: "الملاحظة" },
    },
  },
  {
    re: /^\/api\/finance\/company\/entries$/,
    fields: { date: { label: "التاريخ" }, description: { label: "البيان" }, amount: MONEY },
  },
  {
    re: /^\/api\/receivables\/projects\/[^/]+$/,
    fields: { label: { label: "الدفعة" }, dueDate: { label: "الاستحقاق" }, amount: MONEY },
  },
];

const riyalFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { ...PROJECT_STATUS_LABELS, ...DOC_STATUS_LABELS };
/** A stored value as the owner reads it (amounts are halalas in the tables). */
function show(v: unknown, f: Field, halalas = true): string {
  if (v === null || v === undefined || v === "") return "—";
  if (f.kind === "money") return `${riyalFmt.format(Number(v) / (halalas ? 100 : 1))} ر.س`;
  if (f.kind === "bool") return v ? "نعم" : "لا";
  if (f.kind === "status") return STATUS[String(v)] ?? String(v);
  return String(v);
}
export type Change = { field: string; label: string; before: string; after: string };

async function rowOf(db: Db, w: Watch, id: string) {
  if (!id) return null;
  const [r] = await db.select().from(w.table).where(eq(w.table[w.by], id)).limit(1);
  return (r as Record<string, unknown> | undefined) ?? null;
}

/** Records every successful change made through the API: one place, so none is forgotten. */
export const auditTrail = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const m = c.req.method;
  const path = new URL(c.req.url).pathname;
  const writes = m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE";
  const watch = writes ? WATCH.find((w) => w.re.test(path)) : undefined;
  const watchId = watch ? (path.match(watch.re)?.[1] ?? "") : "";
  const db = c.get("db");
  const before = watch && db ? await rowOf(db, watch, watchId).catch(() => null) : null;
  const create = m === "POST" && !watch ? CREATE.find((x) => x.re.test(path)) : undefined;
  const body = create
    ? ((await c.req.json().catch(() => null)) as Record<string, unknown> | null)
    : null;
  await next();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS" || c.res.status >= 300) return;
  const me = c.get("user");
  if (!me) return;
  const changes: Change[] = [];
  if (watch) {
    const after = await rowOf(c.get("db"), watch, watchId).catch(() => null);
    for (const [k, f] of Object.entries(watch.fields)) {
      const b = before?.[k];
      const a = after?.[k];
      if (!before && !after) continue;
      if (before && after && b === a) continue;
      changes.push({
        field: k,
        label: f.label,
        before: before ? show(b, f) : "—",
        after: after ? show(a, f) : "—",
      });
    }
  } else if (create && body) {
    for (const [k, f] of Object.entries(create.fields))
      if (body[k] !== undefined && body[k] !== "")
        changes.push({ field: k, label: f.label, before: "—", after: show(body[k], f, false) });
  }
  changes.push(...(c.get("auditChanges") ?? []));
  const hit = TRAIL.find((t) => t.re.test(path));
  if (!hit) return;
  const id = path.match(hit.re)?.[1] ?? "";
  const last = path.split("/").filter(Boolean).pop() ?? "";
  const verb = VERBS[last] ?? (m === "POST" ? "إضافة" : m === "DELETE" ? "حذف" : "تعديل");
  await audit(c.get("db"), me, {
    entity: hit.entity,
    entityId: id,
    action: VERBS[last] ? last : m === "POST" ? "create" : m === "DELETE" ? "delete" : "update",
    summary: `${verb} ${hit.noun}`,
    detail: changes.length ? { method: m, path, changes } : { method: m, path },
  });
});
