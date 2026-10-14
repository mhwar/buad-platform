import { fromRiyals } from "@buad/domain";
import { COMPANY_EXPENSE_CATS, COMPANY_INCOME_CATS } from "@buad/schema/company";

/**
 * v1 «مالية المنصة» (`buad2_pf`, app.html Pages.render_pf) → v2 company finance rows.
 * Pure. v1 sync leftovers (income tied to a project or of category project_fee, expenses tied
 * to a project) are skipped, exactly as v1's _pfCleanSyncArtifacts removed them.
 */
type Loose = Record<string, unknown>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const n = (v: unknown) => Number.parseFloat(String(v ?? "")) || 0;
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) ? s(v).slice(0, 10) : "");
const list = (v: unknown) =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Loose[]) : [];

export type PlannedCompany = {
  entries: {
    v1Id: string;
    type: "income" | "expense";
    category: string;
    date: string;
    paymentDate: string;
    description: string;
    amount: number;
    note: string;
  }[];
  partners: { v1Id: string; name: string; sharePct: number; note: string }[];
  distributions: {
    v1Id: string;
    periodType: string;
    periodLabel: string;
    fromDate: string;
    toDate: string;
    grossIncome: number;
    grossExpenses: number;
    netProfit: number;
    distributionPct: number;
    distributedAmount: number;
    retainedAmount: number;
    retainedCategory: "ops" | "dev" | "reserve" | null;
    projectIds: string[];
    status: "draft" | "completed";
    note: string;
    createdAt: number;
    shares: { partnerV1Id: string; partnerName: string; sharePct: number; amount: number }[];
  }[];
  skipped: number;
  /** The file had a `buad2_pf` key at all. */
  present: boolean;
  /** It had only v1 sync leftovers: nothing real to bring (no entries, partners, distributions). */
  legacyOnly: boolean;
  /** v1 sums, to show the import kept every riyal. */
  totals: { income: number; expenses: number; distributed: number; retained: number };
};

const halalas = (v: unknown) => Math.max(0, fromRiyals(n(v)));

export function planCompany(pf: Loose | undefined): PlannedCompany {
  const out: PlannedCompany = {
    entries: [],
    partners: [],
    distributions: [],
    skipped: 0,
    present: !!pf,
    legacyOnly: false,
    totals: { income: 0, expenses: 0, distributed: 0, retained: 0 },
  };
  if (!pf) return out;
  const incCats = COMPANY_INCOME_CATS as readonly string[];
  const expCats = COMPANY_EXPENSE_CATS as readonly string[];
  for (const [type, rows] of [
    ["income", list(pf.income)],
    ["expense", list(pf.expenses)],
  ] as const) {
    for (const [i, e] of rows.entries()) {
      const legacy = !!e.project_id || (type === "income" && e.category === "project_fee");
      const amount = halalas(e.amount);
      if (legacy || amount <= 0) {
        out.skipped++;
        continue;
      }
      const cat = s(e.category);
      out.entries.push({
        v1Id: s(e.id) || `${type}_${i}`,
        type,
        category: (type === "income" ? incCats : expCats).includes(cat) ? cat : "other",
        date: day(e.date),
        paymentDate: type === "income" ? day(e.payment_date) : "",
        description: s(e.desc).trim() || "(بدون وصف)",
        amount,
        note: s(e.note),
      });
      if (type === "income") out.totals.income += amount;
      else out.totals.expenses += amount;
    }
  }
  for (const [i, p] of list(pf.partners).entries())
    out.partners.push({
      v1Id: s(p.id) || `p${i}`,
      name: s(p.name).trim() || "شريك",
      sharePct: Math.min(100, Math.max(0, n(p.share_pct))),
      note: s(p.note),
    });
  for (const [i, d] of list(pf.distributions).entries()) {
    const status = d.status === "completed" ? "completed" : "draft";
    const cat = s(d.retained_category);
    const created = Date.parse(s(d.created_at));
    const dist = {
      v1Id: s(d.id) || `d${i}`,
      periodType: s(d.period_type) || "custom",
      periodLabel: s(d.period_label),
      fromDate: day(d.from_date),
      toDate: day(d.to_date),
      grossIncome: halalas(d.gross_income),
      grossExpenses: halalas(d.gross_expenses),
      netProfit: halalas(d.net_profit),
      distributionPct: Math.min(100, Math.max(0, n(d.distribution_pct) || 100)),
      distributedAmount: halalas(d.distributed_amount),
      retainedAmount: halalas(d.retained_amount),
      retainedCategory: (["ops", "dev", "reserve"].includes(cat) ? cat : null) as
        | "ops"
        | "dev"
        | "reserve"
        | null,
      projectIds: Array.isArray(d.selected_project_ids) ? d.selected_project_ids.map(s) : [],
      status: status as "draft" | "completed",
      note: s(d.note),
      createdAt: Number.isFinite(created) ? Math.floor(created / 1000) : 0,
      shares: list(d.entries).map((e) => ({
        partnerV1Id: s(e.partner_id),
        partnerName: s(e.partner_name) || "شريك",
        sharePct: n(e.share_pct),
        amount: halalas(e.amount),
      })),
    };
    out.distributions.push(dist);
    if (status === "completed") {
      out.totals.distributed += dist.distributedAmount;
      out.totals.retained += dist.retainedAmount;
    }
  }
  out.legacyOnly =
    out.skipped > 0 && !out.entries.length && !out.partners.length && !out.distributions.length;
  return out;
}
