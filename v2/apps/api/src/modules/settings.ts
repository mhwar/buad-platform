import { formatCode, NUMBERING, NUMBERING_KINDS, type NumberingKind } from "@buad/domain";
import { orgCounters, orgSettings } from "@buad/schema/db";
import { DEFAULT_CTRL } from "@buad/schema/finance";
import {
  DEFAULT_DOC_TEXTS,
  type DocTexts,
  orgPrefsPatch,
  orgSettingsPatch,
  type ProjectDefaults,
  projectDefaults,
} from "@buad/schema/org";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requirePerm, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import type { Change } from "./audit";
import { atomic, nextCounter, nowSec } from "./common";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

/** What a new project starts with before anyone sets otherwise: the platform's own defaults. */
export const BUILT_IN_DEFAULTS: ProjectDefaults = projectDefaults.parse(DEFAULT_CTRL);

const DEFAULTS_KEY = "project_defaults";
const CASH_KEY = "cash_opening";
const DIST_KEY = "distribution_defaults";
const targetKey = (year: string | number) => `target:${year}`;

async function readKey<T>(db: Db, orgId: string, key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: orgSettings.value })
    .from(orgSettings)
    .where(and(eq(orgSettings.orgId, orgId), eq(orgSettings.key, key)))
    .limit(1);
  return row ? (JSON.parse(row.value) as T) : null;
}

/** The defaults the organisation saved, or null while it relies on the built-in ones. */
export const savedProjectDefaults = (db: Db, orgId: string) =>
  readKey<ProjectDefaults>(db, orgId, DEFAULTS_KEY);

/** The year's revenue target set in the settings (riyals), or null when none is. */
export const settingsTarget = (db: Db, orgId: string, year: number) =>
  readKey<number>(db, orgId, targetKey(year));

export type CashOpening = { amount: number; date: string; updatedBy: string; updatedAt: number };

export async function loadSettings(db: Db, orgId: string) {
  const rows = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId));
  const get = (k: string) => rows.find((r) => r.key === k);
  const targets: Record<string, number> = {};
  for (const r of rows)
    if (r.key.startsWith("target:")) targets[r.key.slice(7)] = JSON.parse(r.value) as number;
  const cash = get(CASH_KEY);
  const dist = get(DIST_KEY);
  const defaults = get(DEFAULTS_KEY);
  return {
    projectDefaults: { ...BUILT_IN_DEFAULTS, ...(defaults ? JSON.parse(defaults.value) : {}) },
    /** False while the built-in defaults are in use. */
    projectDefaultsSet: !!defaults,
    targets,
    distributionDefaults: dist
      ? (JSON.parse(dist.value) as { pct: number; retainedCategory: "ops" | "dev" | "reserve" })
      : { pct: 100, retainedCategory: "reserve" as const },
    cashOpening: cash
      ? ({
          ...(JSON.parse(cash.value) as { amount: number; date: string }),
          updatedBy: cash.updatedBy,
          updatedAt: cash.updatedAt,
        } satisfies CashOpening)
      : null,
  };
}

const FEE_LABEL: Record<string, string> = {
  vatPct: "نسبة الضريبة",
  vatIncluded: "شاملة الضريبة",
  execV: "أتعاب التنفيذ",
  mktV: "التسويق",
  cbV: "الكاش باك",
  cfV: "الرسوم الإضافية",
};
const showValue = (v: unknown) =>
  v === true
    ? "نعم"
    : v === false
      ? "لا"
      : typeof v === "number"
        ? v.toLocaleString("en")
        : String(v);

/**
 * «الإعدادات ← المالية»: read by anyone who sees the company's money, changed by whoever may edit
 * it. Each change lands in the activity log with its values before and after.
 */
export const settingsApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("treasury.view", "treasury.edit"))
  .get("/", async (c) =>
    c.json({ ok: true, ...(await loadSettings(c.get("db"), c.get("user").orgId)) }),
  )
  .patch("/", zValidator("json", orgSettingsPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const before = await loadSettings(db, me.orgId);
    const t = nowSec();
    const changes: Change[] = [];
    const queries: Parameters<typeof atomic>[1] = [];
    const put = (key: string, value: unknown) =>
      queries.push(
        db
          .insert(orgSettings)
          .values({
            orgId: me.orgId,
            key,
            value: JSON.stringify(value),
            updatedBy: me.id,
            updatedAt: t,
          })
          .onConflictDoUpdate({
            target: [orgSettings.orgId, orgSettings.key],
            set: { value: JSON.stringify(value), updatedBy: me.id, updatedAt: t },
          }),
      );
    const drop = (key: string) =>
      queries.push(
        db
          .delete(orgSettings)
          .where(and(eq(orgSettings.orgId, me.orgId), eq(orgSettings.key, key))),
      );

    if (v.projectDefaults) {
      put(DEFAULTS_KEY, v.projectDefaults);
      for (const [k, label] of Object.entries(FEE_LABEL)) {
        const b = before.projectDefaults[k as keyof ProjectDefaults];
        const a = v.projectDefaults[k as keyof ProjectDefaults];
        if (b !== a) changes.push({ field: k, label, before: showValue(b), after: showValue(a) });
      }
    }
    for (const [year, target] of Object.entries(v.targets ?? {})) {
      const b = before.targets[year];
      if (target === null) drop(targetKey(year));
      else put(targetKey(year), target);
      if ((b ?? null) !== target)
        changes.push({
          field: targetKey(year),
          label: `مستهدف ${year}`,
          before: b === undefined ? "—" : showValue(b),
          after: target === null ? "—" : showValue(target),
        });
    }
    if (v.cashOpening !== undefined) {
      if (v.cashOpening === null) drop(CASH_KEY);
      else put(CASH_KEY, v.cashOpening);
      const b = before.cashOpening;
      changes.push({
        field: CASH_KEY,
        label: "الرصيد الافتتاحي",
        before: b ? `${showValue(b.amount)} (${b.date})` : "—",
        after: v.cashOpening ? `${showValue(v.cashOpening.amount)} (${v.cashOpening.date})` : "—",
      });
    }
    if (v.distributionDefaults) {
      put(DIST_KEY, v.distributionDefaults);
      const b = before.distributionDefaults;
      if (b.pct !== v.distributionDefaults.pct)
        changes.push({
          field: "dist_pct",
          label: "نسبة التوزيع الافتراضية",
          before: `${b.pct}%`,
          after: `${v.distributionDefaults.pct}%`,
        });
    }
    if (queries.length) await atomic(db, queries);
    c.set("auditChanges", changes);
    return c.json({ ok: true, ...(await loadSettings(db, me.orgId)) });
  });

/* ── Numbering and document texts («بيانات الجهة»): read by all, set by who edits the org ── */
const NUMBERING_KEY = "numbering";
const TEXTS_KEY = "doc_texts";
const yearOf = (kind: NumberingKind) => (NUMBERING[kind].yearly ? new Date().getUTCFullYear() : 0);

async function prefixes(db: Db, orgId: string) {
  return (await readKey<Partial<Record<NumberingKind, string>>>(db, orgId, NUMBERING_KEY)) ?? {};
}

/** The next code of a kind, e.g. «PRJ-2026-0012», with the organisation's prefix if it set one. */
export async function nextCode(db: Db, orgId: string, kind: NumberingKind) {
  const prefix = (await prefixes(db, orgId))[kind] || NUMBERING[kind].prefix;
  const year = yearOf(kind);
  return formatCode(prefix, await nextCounter(db, orgId, kind, year), year || undefined);
}

export async function docTextsFor(db: Db, orgId: string): Promise<DocTexts> {
  return { ...DEFAULT_DOC_TEXTS, ...(await readKey<Partial<DocTexts>>(db, orgId, TEXTS_KEY)) };
}

async function loadPrefs(db: Db, orgId: string) {
  const own = await prefixes(db, orgId);
  const counters = await db.select().from(orgCounters).where(eq(orgCounters.orgId, orgId));
  const used = (kind: NumberingKind) =>
    counters.find((c) => c.kind === kind && c.year === yearOf(kind))?.value ?? 0;
  return {
    numbering: NUMBERING_KINDS.map((kind) => {
      const prefix = own[kind] || NUMBERING[kind].prefix;
      const year = yearOf(kind);
      return {
        kind,
        label: NUMBERING[kind].label,
        prefix,
        defaultPrefix: NUMBERING[kind].prefix,
        yearly: NUMBERING[kind].yearly,
        next: used(kind) + 1,
        example: formatCode(prefix, used(kind) + 1, year || undefined),
      };
    }),
    texts: await docTextsFor(db, orgId),
  };
}

export const prefsApp = new Hono<Env>()
  .use(requireAuth)
  .get("/", async (c) =>
    c.json({ ok: true, ...(await loadPrefs(c.get("db"), c.get("user").orgId)) }),
  )
  .patch("/", requirePerm("org.edit"), zValidator("json", orgPrefsPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const v = c.req.valid("json");
    const before = await loadPrefs(db, me.orgId);
    const t = nowSec();
    const changes: Change[] = [];
    const queries: Parameters<typeof atomic>[1] = [];
    const upsert = (key: string, value: unknown) =>
      db
        .insert(orgSettings)
        .values({
          orgId: me.orgId,
          key,
          value: JSON.stringify(value),
          updatedBy: me.id,
          updatedAt: t,
        })
        .onConflictDoUpdate({
          target: [orgSettings.orgId, orgSettings.key],
          set: { value: JSON.stringify(value), updatedBy: me.id, updatedAt: t },
        });

    if (v.numbering) {
      const own = await prefixes(db, me.orgId);
      for (const [kind, change] of Object.entries(v.numbering)) {
        if (!(kind in NUMBERING)) return c.json({ ok: false, error: "unknown_kind" }, 400);
        const k = kind as NumberingKind;
        const was = before.numbering.find((n) => n.kind === k);
        if (!was) continue;
        if (change.prefix !== undefined && change.prefix !== was.prefix) {
          own[k] = change.prefix;
          changes.push({
            field: `prefix:${k}`,
            label: `بادئة ${was.label}`,
            before: was.prefix,
            after: change.prefix,
          });
        }
        if (change.next !== undefined && change.next !== was.next) {
          // Moving back could hand out a number already used: refused.
          if (change.next < was.next)
            return c.json({ ok: false, error: "counter_down", kind: k, next: was.next }, 409);
          const year = yearOf(k);
          queries.push(
            db
              .insert(orgCounters)
              .values({ orgId: me.orgId, kind: k, year, value: change.next - 1 })
              .onConflictDoUpdate({
                target: [orgCounters.orgId, orgCounters.kind, orgCounters.year],
                set: { value: sql`MAX(${orgCounters.value}, ${change.next - 1})` },
              }),
          );
          changes.push({
            field: `next:${k}`,
            label: `الرقم التالي: ${was.label}`,
            before: String(was.next),
            after: String(change.next),
          });
        }
      }
      queries.push(upsert(NUMBERING_KEY, own));
    }
    if (v.texts) {
      const next = { ...before.texts, ...v.texts };
      queries.push(upsert(TEXTS_KEY, next));
      const TEXT_LABEL: Record<keyof DocTexts, string> = {
        quoteTerms: "شروط عرض السعر",
        quoteValidityDays: "صلاحية عرض السعر (أيام)",
        letterClosing: "خاتمة الخطاب",
      };
      for (const k of Object.keys(TEXT_LABEL) as (keyof DocTexts)[])
        if (before.texts[k] !== next[k])
          changes.push({
            field: k,
            label: TEXT_LABEL[k],
            before: String(before.texts[k] || "—"),
            after: String(next[k] || "—"),
          });
    }
    if (queries.length) await atomic(db, queries);
    c.set("auditChanges", changes);
    return c.json({ ok: true, ...(await loadPrefs(db, me.orgId)) });
  });
