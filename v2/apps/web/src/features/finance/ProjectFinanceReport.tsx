import { ENTRY_STATUS_LABELS } from "@buad/schema/finance";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { Button, Segmented } from "../../components/ui";
import { csvToRows, downloadSheet } from "../../lib/export";
import { day, fromEpoch, pct, sar } from "../../lib/format";
import { FitToWidth } from "../documents/FitToWidth";
import { type Block, PagedSheets } from "../documents/Pages";
import { PdfButton } from "../documents/PdfButton";
import { SHEET_STYLE } from "../finance-overview/ReportPage";
import { section } from "../finance-overview/report-blocks";
import { orgProfileQuery } from "../org/OrgSettings";
import { type ProjectDetail, projectQuery } from "../projects/api";
import { type Finance, financeQuery } from "./api";
import { catLabel, FEE_ROWS } from "./labels";

export type ReportMode = "client" | "detailed";

/**
 * A project's financial report on the letterhead (v1 «كشف المعاملات» / التقرير التفصيلي):
 *  - client:   contract value, VAT, the transactions, spent and remaining — nothing internal
 *  - detailed: + fees and profit, the agreement report (agreed vs registered) and budget vs actual
 */
export function ProjectFinanceReport({
  projectId,
  mode,
  onMode,
}: {
  projectId: string;
  mode: ReportMode;
  onMode?: (m: ReportMode) => void;
}) {
  const fin = useQuery(financeQuery(projectId));
  const prj = useQuery(projectQuery(projectId));
  const org = useQuery(orgProfileQuery);
  if (!fin.data || !prj.data || !org.data)
    return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  const name = `${prj.data.project.number}-${mode === "client" ? "statement" : "finance"}`;
  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            to="/projects/$id"
            params={{ id: projectId }}
            search={{ view: "finance" }}
            className="text-sm text-muted hover:text-ink"
          >
            ← {prj.data.project.name}
          </Link>
          <h1 className="text-xl font-bold">التقرير المالي للمشروع</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onMode && (
            <Segmented<ReportMode>
              label="نوع التقرير"
              value={mode}
              onChange={onMode}
              items={[
                { value: "client", label: "للعميل" },
                { value: "detailed", label: "تفصيلي (داخلي)" },
              ]}
            />
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
          <PdfButton path={`/print/finance/${projectId}?mode=${mode}`} name={name} />
          <Button variant="secondary" onClick={() => downloadCsv(fin.data, prj.data, mode)}>
            <Download className="size-4" /> Excel
          </Button>
        </div>
      </div>
      <div className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
        <FitToWidth>
          <PagedSheets
            title="التقرير المالي للمشروع"
            style={SHEET_STYLE}
            header={org.data.urls.headerAsset}
            footer={org.data.urls.footerAsset}
            blocks={reportBlocks(fin.data, prj.data, org.data.name ?? "", mode)}
          />
        </FitToWidth>
      </div>
    </div>
  );
}

const live = (f: Finance) => f.entries.filter((e) => e.status !== "cancelled");

/** v1 «تقرير الاتفاقية»: each agreed item, what was registered for it, and the difference. */
export function agreementRows(f: Finance) {
  const s = f.summary;
  const c = f.ctrl;
  const amount: Record<string, number> = { exec: s.execAmt, mkt: s.mkt, cb: s.cb, cf: s.cfAmt };
  const cat: Record<string, string> = { exec: "exec", mkt: "mkt", cb: "cashback", cf: "cf" };
  const basis = (k: "exec" | "mkt" | "cb" | "cf") => {
    const v = c[`${k}V`];
    if (!v) return "—";
    return c[`${k}Type`] === "fixed"
      ? `${sar(v)} ثابت`
      : `${v}% من ${c[`${k}Base`] === "gross" ? "الإجمالي" : "الصافي"}`;
  };
  return FEE_ROWS.filter((r) => (amount[r.key] ?? 0) > 0).map((r) => {
    const registered =
      live(f)
        .filter((e) => e.cat === cat[r.key])
        .reduce((a, e) => a + e.amount, 0) / 100;
    return {
      label: r.label,
      basis: basis(r.key as "exec"),
      agreed: amount[r.key] ?? 0,
      registered,
      diff: registered - (amount[r.key] ?? 0),
    };
  });
}

/** Planned budget items against what was spent on each (entries in its `bdg_` category). */
export function budgetRows(f: Finance) {
  return f.budget.map((b) => {
    const actual =
      live(f)
        .filter((e) => e.cat === `bdg_${b.id}`)
        .reduce((a, e) => a + e.amount, 0) / 100;
    return {
      name: b.name || "بند",
      planned: b.amount / 100,
      actual,
      diff: b.amount / 100 - actual,
    };
  });
}

function reportBlocks(f: Finance, p: ProjectDetail, orgName: string, mode: ReportMode): Block[] {
  const s = f.summary;
  const detailed = mode === "detailed" && !f.profitHidden;
  const margin = s.grossTotal ? (s.profit / s.grossTotal) * 100 : 0;
  const entries = [...f.entries].sort((a, b) => a.date.localeCompare(b.date));
  const intro: Block = {
    key: "intro",
    node: (
      <>
        <h1 className="doc-title">
          {detailed ? "التقرير المالي التفصيلي" : "كشف المعاملات المالية"}
        </h1>
        <div className="st-meta">
          <div>
            <p>
              <b>المشروع:</b> {p.project.name}
            </p>
            <p>
              <b>العميل:</b> {p.client?.name ?? "—"}
            </p>
            {f.ctrl.contractNo && (
              <p>
                <b>رقم العقد:</b> <span dir="ltr">{f.ctrl.contractNo}</span>
              </p>
            )}
          </div>
          <div>
            <p>
              <b>رقم المشروع:</b> <span dir="ltr">{p.project.number}</span>
            </p>
            {f.ctrl.contractDate && (
              <p>
                <b>تاريخ العقد:</b> {day(f.ctrl.contractDate)}
              </p>
            )}
            <p>
              <b>تاريخ الإصدار:</b> {fromEpoch(Math.floor(Date.now() / 1000))}
            </p>
          </div>
        </div>
      </>
    ),
  };
  const summary = section(
    "sum",
    "الملخص",
    [60, 40],
    ["البند", "المبلغ"],
    [
      ["قيمة العقد الكاملة", sar(s.grossTotal)],
      ["قيمة العقد قبل الضريبة", sar(s.contractNet)],
      [`ضريبة القيمة المضافة (${f.ctrl.vatPct}%)`, sar(s.vatAmt)],
      ...(detailed
        ? ([
            ["إجمالي الأتعاب والاستقطاعات", sar(s.obligations)],
            ["المتاح للتنفيذ", sar(s.available)],
            ["صافي الربح", `${sar(s.profit)} (هامش ${pct(margin)})`],
          ] as string[][])
        : []),
      ["إجمالي المصروف من العقد", sar(s.totalDeductions)],
      ...(s.pendingExpenses > 0 ? [["منها معلّق غير مدفوع", sar(s.pendingExpenses)]] : []),
      ["المتبقي من العقد", sar(s.remainingFromGross)],
    ],
  );
  const agreement = detailed
    ? section(
        "agr",
        "تقرير الاتفاقية: المتفق عليه مقابل المسجّل",
        [26, 22, 18, 17, 17],
        ["البند", "الأساس", "المتفق عليه", "المسجّل", "الفرق"],
        agreementRows(f).map((r) => [
          r.label,
          r.basis,
          sar(r.agreed),
          sar(r.registered),
          Math.abs(r.diff) < 0.005 ? "—" : sar(r.diff),
        ]),
      )
    : [];
  const budget =
    detailed && f.budget.length
      ? section(
          "bdg",
          "الميزانية: المخطط مقابل الفعلي",
          [40, 20, 20, 20],
          ["البند", "المخطط", "الفعلي", "المتبقي"],
          budgetRows(f).map((r) => [r.name, sar(r.planned), sar(r.actual), sar(r.diff)]),
          [
            "الإجمالي",
            sar(budgetRows(f).reduce((a, r) => a + r.planned, 0)),
            sar(budgetRows(f).reduce((a, r) => a + r.actual, 0)),
            sar(budgetRows(f).reduce((a, r) => a + r.diff, 0)),
          ],
        )
      : [];
  const ledger = section(
    "ent",
    "المعاملات",
    [14, 38, 18, 12, 18],
    ["التاريخ", "البيان", "التصنيف", "الحالة", "المبلغ"],
    entries.map((e) => [
      day(e.date),
      e.status === "cancelled" ? `${e.description} (ملغى، لا يُحتسب)` : e.description,
      catLabel(e.cat, f.categories, f.budget),
      ENTRY_STATUS_LABELS[e.status] || "—",
      `${e.type === "income" ? "+" : "−"} ${sar(e.amount / 100)}`,
    ]),
    ["الإجمالي", "", "", "", sar(s.totalDeductions)],
  );
  return [
    intro,
    ...summary,
    ...agreement,
    ...budget,
    ...ledger,
    {
      key: "note",
      node: (
        <p className="st-note">
          صادر من {orgName}. القيود الملغاة تظهر للاطلاع ولا تدخل في أي مجموع.
        </p>
      ),
    },
  ];
}

const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
function downloadCsv(f: Finance, p: ProjectDetail, mode: ReportMode) {
  const s = f.summary;
  const lines: (string | number)[][] = [
    ["المشروع", p.project.name, p.project.number],
    ["العميل", p.client?.name ?? ""],
    [],
    ["قيمة العقد الكاملة", s.grossTotal],
    ["الضريبة", s.vatAmt],
    ["إجمالي المصروف", s.totalDeductions],
    ["المتبقي", s.remainingFromGross],
    ...(mode === "detailed" && !f.profitHidden ? [["صافي الربح", s.profit]] : []),
    [],
    ["التاريخ", "البيان", "التصنيف", "النوع", "الحالة", "المبلغ"],
    ...f.entries.map((e) => [
      e.date,
      e.description,
      catLabel(e.cat, f.categories, f.budget),
      e.type === "income" ? "دخل" : "مصروف",
      ENTRY_STATUS_LABELS[e.status] || "",
      e.amount / 100,
    ]),
  ];
  // The agreement report is part of the detailed view, which needs sight of the profit.
  if (mode === "detailed" && !f.profitHidden) {
    lines.push([], ["تقرير الاتفاقية"], ["البند", "المتفق عليه", "المسجّل", "الفرق"]);
    for (const r of agreementRows(f)) lines.push([r.label, r.agreed, r.registered, r.diff]);
  }
  void downloadSheet(`${p.project.number}-${mode}`, "التقرير المالي", lines);
}
