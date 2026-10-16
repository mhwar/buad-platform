import { fromRiyals, type StoredFinance, summarize, vatOfGrossHalalas } from "@buad/domain";
import { BUILTIN_CATEGORIES } from "@buad/schema/clients";
import { receiptInput } from "@buad/schema/company";
import {
  distributionProjects,
  distributions,
  financeBudgetItems,
  financeCategories,
  financeEntries,
  orgVatSettings,
  paymentSchedule,
  projectFinance,
  projectReceipts,
} from "@buad/schema/db";
import {
  AGREEMENT_ITEMS,
  budgetInput,
  budgetPatch,
  categoryInput,
  ctrlPatch,
  DEFAULT_CTRL,
  entryInput,
  entryPatch,
  type taxInvoiceInput,
} from "@buad/schema/finance";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, max, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePerm, requireRW, type Vars } from "../auth/middleware";
import type { Db } from "../auth/service";
import { atomic, newId, nowSec } from "./common";
import { loadVisible } from "./projects";

type Project = NonNullable<Awaited<ReturnType<typeof loadVisible>>>;
type Env = { Bindings: { JWT_SECRET: string }; Variables: Vars & { project: Project } };
const manager = requirePerm("finance.edit");
const today = () => new Date().toISOString().slice(0, 10);

/** v1 registerContractItem descriptions (app.html L9201). */
const AGREEMENT_DESC: Record<string, string> = {
  exec: "أتعاب التنفيذ",
  cf: "ضريبة القيمة المضافة",
  mkt: "تسويق",
  cashback: "كاش باك",
};

/** The organisation's VAT rate for new purchases (15% until set). */
export async function loadVatRate(db: Db, orgId: string) {
  const [row] = await db
    .select({ rate: orgVatSettings.rate })
    .from(orgVatSettings)
    .where(eq(orgVatSettings.orgId, orgId))
    .limit(1);
  return row?.rate ?? 15;
}

type TaxInvoice = NonNullable<z.output<typeof taxInvoiceInput>>;
/** The columns that hold an entry's tax invoice (all cleared when there is none). */
function taxInvoiceColumns(ti: TaxInvoice | null | undefined, amountHalalas: number, rate: number) {
  if (!ti)
    return {
      taxInvoice: false,
      vatAmount: 0,
      supplierName: "",
      supplierVatNo: "",
      invoiceNo: "",
      invoiceDate: "",
    };
  return {
    taxInvoice: true,
    // Worked out once and kept: a later change of the rate never rewrites a registered invoice.
    vatAmount:
      ti.vatAmount !== undefined
        ? Math.min(fromRiyals(ti.vatAmount), amountHalalas)
        : vatOfGrossHalalas(amountHalalas, rate),
    supplierName: ti.supplierName,
    supplierVatNo: ti.supplierVatNo,
    invoiceNo: ti.invoiceNo,
    invoiceDate: ti.invoiceDate,
  };
}

/** Whether a completed profit distribution covered this project on that date. */
async function inCompletedDistribution(db: Db, projectId: string, date: string) {
  const [hit] = await db
    .select({ id: distributions.id })
    .from(distributions)
    .innerJoin(distributionProjects, eq(distributionProjects.distributionId, distributions.id))
    .where(
      and(
        eq(distributionProjects.projectId, projectId),
        eq(distributions.status, "completed"),
        sql`(${distributions.fromDate} = '' OR ${distributions.fromDate} <= ${date})`,
        sql`(${distributions.toDate} = '' OR ${distributions.toDate} >= ${date})`,
      ),
    )
    .limit(1);
  return !!hit;
}

export async function loadFinance(db: Db, project: Pick<Project, "id" | "expectedValue">) {
  const [row] = await db
    .select()
    .from(projectFinance)
    .where(eq(projectFinance.projectId, project.id))
    .limit(1);
  const entries = await db
    .select()
    .from(financeEntries)
    .where(eq(financeEntries.projectId, project.id))
    .orderBy(desc(financeEntries.date), desc(financeEntries.createdAt));
  const budget = await db
    .select()
    .from(financeBudgetItems)
    .where(eq(financeBudgetItems.projectId, project.id))
    .orderBy(asc(financeBudgetItems.sort));
  const categories = await db
    .select()
    .from(financeCategories)
    .where(eq(financeCategories.projectId, project.id))
    .orderBy(asc(financeCategories.label));
  const receipts = await db
    .select()
    .from(projectReceipts)
    .where(eq(projectReceipts.projectId, project.id))
    .orderBy(asc(projectReceipts.date), asc(projectReceipts.createdAt));
  // No row yet: v1 defaults, contract value from the project's expected value. Nothing is written until a save.
  const ctrl = row
    ? { ...row, opCats: JSON.parse(row.opCats) as string[] }
    : {
        ...DEFAULT_CTRL,
        contractValue: project.expectedValue,
        version: 0,
        updatedAt: null as number | null,
        updatedBy: "",
      };
  const stored: StoredFinance = { ctrl, entries, budget };
  return {
    ctrl: {
      contractNo: ctrl.contractNo,
      contractDate: ctrl.contractDate,
      contractValue: ctrl.contractValue,
      cvLocked: ctrl.cvLocked,
      vatIncluded: ctrl.vatIncluded,
      vatPct: ctrl.vatPct,
      execV: ctrl.execV,
      execType: ctrl.execType,
      execBase: ctrl.execBase,
      mktV: ctrl.mktV,
      mktType: ctrl.mktType,
      mktBase: ctrl.mktBase,
      mktInternal: ctrl.mktInternal,
      cbV: ctrl.cbV,
      cbType: ctrl.cbType,
      cbBase: ctrl.cbBase,
      cfV: ctrl.cfV,
      cfType: ctrl.cfType,
      cfBase: ctrl.cfBase,
      opCats: ctrl.opCats,
      version: ctrl.version,
      updatedAt: ctrl.updatedAt,
    },
    entries,
    budget,
    categories,
    receipts,
    /** Money received from the client so far (riyals). */
    received: receipts.reduce((s, r) => s + r.amount, 0) / 100,
    summary: summarize(stored),
  };
}

async function validCat(db: Db, projectId: string, cat: string) {
  if ((BUILTIN_CATEGORIES as readonly string[]).includes(cat)) return true;
  if (cat.startsWith("bdg_")) {
    const [b] = await db
      .select({ id: financeBudgetItems.id })
      .from(financeBudgetItems)
      .where(
        and(eq(financeBudgetItems.id, cat.slice(4)), eq(financeBudgetItems.projectId, projectId)),
      );
    return !!b;
  }
  const [c] = await db
    .select({ id: financeCategories.id })
    .from(financeCategories)
    .where(and(eq(financeCategories.id, cat), eq(financeCategories.projectId, projectId)));
  return !!c;
}

async function entryOf(db: Db, projectId: string, id: string) {
  const [e] = await db
    .select()
    .from(financeEntries)
    .where(and(eq(financeEntries.id, id), eq(financeEntries.projectId, projectId)))
    .limit(1);
  return e ?? null;
}

export const financeApp = new Hono<Env>()
  .use(requireAuth)
  .use(requireRW("finance.view", "finance.edit"))
  // Resolve the project once; invisible or foreign projects are 404 for every finance route.
  .use(async (c, next) => {
    const project = await loadVisible(c.get("db"), c.get("user"), c.req.param("projectId") ?? "");
    if (!project) return c.json({ ok: false, error: "not_found" }, 404);
    c.set("project", project);
    await next();
  })

  .get("/", async (c) => {
    const project = c.get("project");
    const data = await loadFinance(c.get("db"), project);
    // Without «إظهار الأرباح» the person sees amounts but not what the company earns on them.
    if (!c.get("user").perms.includes("finance.profit")) {
      return c.json({
        ok: true,
        ...data,
        entries: data.entries.map((e) => ({ ...e, profitMargin: 0 })),
        summary: { ...data.summary, profit: 0, profitMargins: [] },
        profitHidden: true,
      });
    }
    return c.json({ ok: true, ...data, profitHidden: false });
  })

  .patch("/ctrl", manager, zValidator("json", ctrlPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = c.get("project");
    const { version, contractValue, opCats, ...rest } = c.req.valid("json");
    const t = nowSec();
    const [row] = await db
      .select()
      .from(projectFinance)
      .where(eq(projectFinance.projectId, project.id))
      .limit(1);
    const currentVersion = row?.version ?? 0;
    if (version !== currentVersion)
      return c.json({ ok: false, error: "stale", version: currentVersion }, 409);
    const locked = rest.cvLocked ?? row?.cvLocked ?? false;
    if (
      contractValue !== undefined &&
      locked &&
      (row?.contractValue ?? project.expectedValue) !== fromRiyals(contractValue)
    ) {
      return c.json({ ok: false, error: "cv_locked" }, 409);
    }
    const values = {
      ...rest,
      ...(contractValue !== undefined ? { contractValue: fromRiyals(contractValue) } : {}),
      ...(opCats !== undefined ? { opCats: JSON.stringify(opCats) } : {}),
      updatedBy: me.id,
      updatedAt: t,
    };
    if (!row) {
      const inserted = await db
        .insert(projectFinance)
        .values({
          ...DEFAULT_CTRL,
          opCats: "[]",
          contractValue: project.expectedValue,
          ...values,
          projectId: project.id,
          orgId: me.orgId,
          version: 1,
          createdBy: me.id,
          createdAt: t,
        })
        .onConflictDoNothing()
        .returning({ version: projectFinance.version });
      if (!inserted.length) return c.json({ ok: false, error: "stale", version: 1 }, 409);
    } else {
      // Only succeeds if nobody saved in between (compare-and-swap on version).
      const updated = await db
        .update(projectFinance)
        .set({ ...values, version: currentVersion + 1 })
        .where(
          and(eq(projectFinance.projectId, project.id), eq(projectFinance.version, currentVersion)),
        )
        .returning({ version: projectFinance.version });
      if (!updated.length)
        return c.json({ ok: false, error: "stale", version: currentVersion + 1 }, 409);
    }
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  // Entries imported without a status (v1 allowed none): mark them all at once.
  .post(
    "/entries/bulk-status",
    manager,
    zValidator("json", z.object({ status: z.enum(["paid", "pending"]) })),
    async (c) => {
      const db = c.get("db");
      const me = c.get("user");
      const project = c.get("project");
      const { status } = c.req.valid("json");
      await db
        .update(financeEntries)
        .set({ status, updatedBy: me.id, updatedAt: nowSec() })
        .where(and(eq(financeEntries.projectId, project.id), eq(financeEntries.status, "")));
      return c.json({ ok: true, ...(await loadFinance(db, project)) });
    },
  )

  .post("/entries", manager, zValidator("json", entryInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = c.get("project");
    const { taxInvoice, ...v } = c.req.valid("json");
    if (!(await validCat(db, project.id, v.cat)))
      return c.json({ ok: false, error: "invalid_category" }, 400);
    // A tax invoice belongs to a purchase (an expense).
    if (taxInvoice && v.type !== "expense")
      return c.json({ ok: false, error: "tax_invoice_on_expense_only" }, 400);
    const t = nowSec();
    const id = newId("ent");
    await db.insert(financeEntries).values({
      ...v,
      ...taxInvoiceColumns(taxInvoice, fromRiyals(v.amount), await loadVatRate(db, me.orgId)),
      id,
      orgId: me.orgId,
      projectId: project.id,
      date: v.date || today(),
      amount: fromRiyals(v.amount),
      source: "manual",
      createdBy: me.id,
      createdAt: t,
      updatedBy: me.id,
      updatedAt: t,
    });
    return c.json({ ok: true, id, ...(await loadFinance(db, project)) }, 201);
  })

  .patch("/entries/:entryId", manager, zValidator("json", entryPatch), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = c.get("project");
    const e = await entryOf(db, project.id, c.req.param("entryId"));
    if (!e) return c.json({ ok: false, error: "not_found" }, 404);
    const { amount, taxInvoice, ...v } = c.req.valid("json");
    if (v.cat !== undefined && !(await validCat(db, project.id, v.cat)))
      return c.json({ ok: false, error: "invalid_category" }, 400);
    const type = v.type ?? e.type;
    if (taxInvoice && type !== "expense")
      return c.json({ ok: false, error: "tax_invoice_on_expense_only" }, 400);
    // `taxInvoice` absent = leave as is; null = remove; an object = register or update.
    const ti =
      taxInvoice !== undefined || type !== "expense"
        ? taxInvoiceColumns(
            type === "expense" ? taxInvoice : null,
            amount !== undefined ? fromRiyals(amount) : e.amount,
            await loadVatRate(db, me.orgId),
          )
        : {};
    await db
      .update(financeEntries)
      .set({
        ...v,
        ...ti,
        ...(amount !== undefined ? { amount: fromRiyals(amount) } : {}),
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(eq(financeEntries.id, e.id));
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  .delete("/entries/:entryId", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const e = await entryOf(db, project.id, c.req.param("entryId"));
    if (!e) return c.json({ ok: false, error: "not_found" }, 404);
    await db.delete(financeEntries).where(eq(financeEntries.id, e.id));
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  // «من الاتفاقية»: one click turns a contract item into an entry with the computed amount (once only).
  .post("/agreement/:item", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const fin = await loadFinance(db, project);
    const r = await registerAgreement(db, c.get("user"), project.id, fin, c.req.param("item"));
    if (r !== "ok")
      return c.json(
        { ok: false, error: r },
        r === "not_found" ? 404 : r === "already_registered" ? 409 : 400,
      );
    return c.json({ ok: true, ...(await loadFinance(db, project)) }, 201);
  })

  // Register every contract item that still has no entry (v1's «لم تُسجَّل بعد» list) in one go.
  .post("/agreement-all", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const fin = await loadFinance(db, project);
    const registered: string[] = [];
    for (const item of AGREEMENT_ITEMS) {
      // v1 counts an item as registered when any entry uses its category.
      if (fin.entries.some((e) => e.cat === item && e.status !== "cancelled")) continue;
      if ((await registerAgreement(db, c.get("user"), project.id, fin, item)) === "ok")
        registered.push(item);
    }
    return c.json({ ok: true, registered, ...(await loadFinance(db, project)) });
  })

  // ── Money received from the client (instalments; negative = refund) ─────────
  .post("/receipts", manager, zValidator("json", receiptInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = c.get("project");
    const v = c.req.valid("json");
    await db.insert(projectReceipts).values({
      id: newId("rcp"),
      orgId: me.orgId,
      projectId: project.id,
      date: v.date,
      amount: Math.sign(v.amount) * fromRiyals(Math.abs(v.amount)),
      note: v.note,
      basis: v.basis,
      // Saving a receipt is the verification: who approved it, and when, stays with it.
      approvedBy: me.id,
      approvedAt: nowSec(),
      createdBy: me.id,
      updatedBy: me.id,
    });
    return c.json({ ok: true, ...(await loadFinance(db, project)) }, 201);
  })
  .patch("/receipts/:receiptId", manager, zValidator("json", receiptInput), async (c) => {
    const db = c.get("db");
    const me = c.get("user");
    const project = c.get("project");
    const v = c.req.valid("json");
    const upd = await db
      .update(projectReceipts)
      .set({
        date: v.date,
        amount: Math.sign(v.amount) * fromRiyals(Math.abs(v.amount)),
        note: v.note,
        updatedBy: me.id,
        updatedAt: nowSec(),
      })
      .where(
        and(
          eq(projectReceipts.id, c.req.param("receiptId")),
          eq(projectReceipts.projectId, project.id),
        ),
      )
      .returning({ id: projectReceipts.id });
    if (!upd.length) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })
  .delete("/receipts/:receiptId", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const [rc] = await db
      .select()
      .from(projectReceipts)
      .where(
        and(
          eq(projectReceipts.id, c.req.param("receiptId")),
          eq(projectReceipts.projectId, project.id),
        ),
      )
      .limit(1);
    if (!rc) return c.json({ ok: false, error: "not_found" }, 404);
    // Profit already paid out to partners from this money: deleting it would leave the project
    // «distributed more than it earned». Reverse the distribution first.
    if (await inCompletedDistribution(db, project.id, rc.date))
      return c.json({ ok: false, error: "in_distribution" }, 409);
    // An instalment it closed goes back to waiting, so it can be received again.
    await atomic(db, [
      db.delete(projectReceipts).where(eq(projectReceipts.id, rc.id)),
      db
        .update(paymentSchedule)
        .set({ status: "pending", receiptId: "", receivedAt: "" })
        .where(eq(paymentSchedule.receiptId, rc.id)),
    ]);
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  .post("/budget", manager, zValidator("json", budgetInput), async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const v = c.req.valid("json");
    const [m] = await db
      .select({ n: max(financeBudgetItems.sort) })
      .from(financeBudgetItems)
      .where(eq(financeBudgetItems.projectId, project.id));
    await db.insert(financeBudgetItems).values({
      id: newId("bud"),
      projectId: project.id,
      name: v.name,
      amount: fromRiyals(v.amount),
      note: v.note,
      sort: (m?.n ?? 0) + 1,
    });
    return c.json({ ok: true, ...(await loadFinance(db, project)) }, 201);
  })

  .patch("/budget/:itemId", manager, zValidator("json", budgetPatch), async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const { amount, ...v } = c.req.valid("json");
    const res = await db
      .update(financeBudgetItems)
      .set({ ...v, ...(amount !== undefined ? { amount: fromRiyals(amount) } : {}) })
      .where(
        and(
          eq(financeBudgetItems.id, c.req.param("itemId")),
          eq(financeBudgetItems.projectId, project.id),
        ),
      )
      .returning({ id: financeBudgetItems.id });
    if (!res.length) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  .delete("/budget/:itemId", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const res = await db
      .delete(financeBudgetItems)
      .where(
        and(
          eq(financeBudgetItems.id, c.req.param("itemId")),
          eq(financeBudgetItems.projectId, project.id),
        ),
      )
      .returning({ id: financeBudgetItems.id });
    if (!res.length) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  })

  .post("/categories", manager, zValidator("json", categoryInput), async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const v = c.req.valid("json");
    const id = `cc_${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(financeCategories).values({ id, projectId: project.id, ...v });
    return c.json({ ok: true, id, ...(await loadFinance(db, project)) }, 201);
  })

  .delete("/categories/:catId", manager, async (c) => {
    const db = c.get("db");
    const project = c.get("project");
    const id = c.req.param("catId");
    const [used] = await db
      .select({ n: count() })
      .from(financeEntries)
      .where(and(eq(financeEntries.projectId, project.id), eq(financeEntries.cat, id)));
    if ((used?.n ?? 0) > 0) return c.json({ ok: false, error: "in_use", count: used?.n }, 409);
    const res = await db
      .delete(financeCategories)
      .where(and(eq(financeCategories.id, id), eq(financeCategories.projectId, project.id)))
      .returning({ id: financeCategories.id });
    if (!res.length) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, ...(await loadFinance(db, project)) });
  });

type FinanceView = Awaited<ReturnType<typeof loadFinance>>;

async function registerAgreement(
  db: Db,
  me: { id: string; orgId: string },
  projectId: string,
  fin: FinanceView,
  item: string,
): Promise<"ok" | "not_found" | "zero_amount" | "already_registered"> {
  let cat: string;
  let description: string;
  let amount: number;
  if ((AGREEMENT_ITEMS as readonly string[]).includes(item)) {
    cat = item;
    description = AGREEMENT_DESC[item] ?? item;
    const s = fin.summary;
    amount = item === "exec" ? s.execAmt : item === "cf" ? s.cfAmt : item === "mkt" ? s.mkt : s.cb;
  } else if (item.startsWith("bdg_")) {
    const b = fin.budget.find((x) => x.id === item.slice(4));
    if (!b) return "not_found";
    cat = item;
    description = b.name;
    amount = b.amount / 100;
  } else {
    return "not_found";
  }
  const halalas = fromRiyals(amount);
  if (halalas <= 0) return "zero_amount";
  // Registered = any live (not cancelled) entry in that category — the same rule as «تسجيل الكل».
  if (fin.entries.some((e) => e.cat === cat && e.status !== "cancelled"))
    return "already_registered";
  const t = nowSec();
  await db.insert(financeEntries).values({
    id: newId("ent"),
    orgId: me.orgId,
    projectId,
    date: today(),
    description,
    cat,
    type: cat === "exec" ? "income" : "expense",
    amount: halalas,
    status: "paid",
    source: "agreement",
    createdBy: me.id,
    createdAt: t,
    updatedBy: me.id,
    updatedAt: t,
  });
  return "ok";
}
