import { auditLog } from "@buad/schema/db";
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
  { re: /^\/api\/plans/, entity: "plan", noun: "الخطط" },
  { re: /^\/api\/site/, entity: "site", noun: "الموقع" },
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

/** Records every successful change made through the API: one place, so none is forgotten. */
export const auditTrail = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  await next();
  const m = c.req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS" || c.res.status >= 300) return;
  const me = c.get("user");
  if (!me) return;
  const path = new URL(c.req.url).pathname;
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
    detail: { method: m, path },
  });
});
