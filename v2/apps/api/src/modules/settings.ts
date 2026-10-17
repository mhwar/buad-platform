import { orgSettings } from "@buad/schema/db";
import { DEFAULT_CTRL } from "@buad/schema/finance";
import { orgSettingsPatch, type ProjectDefaults, projectDefaults } from "@buad/schema/org";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import type { Change } from "./audit";
import { atomic, nowSec } from "./common";

type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars };

/** What a new project starts with before anyone sets otherwise: the platform's own defaults. */
export const BUILT_IN_DEFAULTS: ProjectDefaults = projectDefaults.parse(DEFAULT_CTRL);

const DEFAULTS_KEY = "project_defaults";
const CASH_KEY = "cash_opening";
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
  const defaults = get(DEFAULTS_KEY);
  return {
    projectDefaults: { ...BUILT_IN_DEFAULTS, ...(defaults ? JSON.parse(defaults.value) : {}) },
    /** False while the built-in defaults are in use. */
    projectDefaultsSet: !!defaults,
    targets,
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
    if (queries.length) await atomic(db, queries);
    c.set("auditChanges", changes);
    return c.json({ ok: true, ...(await loadSettings(db, me.orgId)) });
  });
