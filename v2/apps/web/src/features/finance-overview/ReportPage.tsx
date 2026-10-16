import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button, EmptyState } from "../../components/ui";
import { csvToRows, downloadSheet } from "../../lib/export";
import { day, fromEpoch, pct, sar } from "../../lib/format";
import { FitToWidth } from "../documents/FitToWidth";
import { type Block, PagedSheets } from "../documents/Pages";
import { PdfButton } from "../documents/PdfButton";
import { type Period, periodQs, type Report, reportQuery } from "./api";
import { monthLabel } from "./charts";
import {
  type CompanyOverview,
  companyOverviewQuery,
  type Distribution,
  distributionsQuery,
} from "./company-api";
import { section } from "./report-blocks";

const route = getRouteApi("/finance/report");
export const SHEET_STYLE = {
  "--doc-fs": "10pt",
  "--doc-lh": 1.6,
  "--doc-mx": "1.6cm",
} as React.CSSProperties;

const periodText = (p: Period) =>
  p.from || p.to
    ? `من ${p.from ? day(p.from) : "البداية"} إلى ${p.to ? day(p.to) : "اليوم"}`
    : "كل الفترات";

/** «التقرير المالي»: the dashboard as an A4 report on the letterhead (print, PDF, Excel). */
export function ReportPage() {
  const s = route.useSearch();
  const period: Period = { from: s.from, to: s.to };
  const q = useQuery(reportQuery(period));
  const co = useQuery(companyOverviewQuery(period));
  const dists = useQuery(distributionsQuery);
  // Every section must be in before the pages are measured (the PDF waits for them).
  if (q.isPending || co.isPending || dists.isPending)
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="تعذّر إعداد التقرير"
        action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const r = q.data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <nav className="mb-1 text-sm text-muted">
            <Link to="/finance" className="hover:text-ink">
              ← المالية
            </Link>
          </nav>
          <h1 className="text-xl font-bold">التقرير المالي</h1>
          <p className="text-xs text-muted">{periodText(period)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCsv(r, period)}>
            <Download className="size-4" /> تصدير Excel
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
          <PdfButton
            path={`/finance/report${periodQs(period)}`}
            name={`finance-report-${period.from || "all"}-${period.to || ""}`.replace(/-$/, "")}
          />
        </div>
      </div>
      <div className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
        <FitToWidth>
          <PagedSheets
            title="التقرير المالي"
            style={SHEET_STYLE}
            header={r.org.urls.headerAsset}
            footer={r.org.urls.footerAsset}
            blocks={reportBlocks(r, period, co.data, dists.data)}
          />
        </FitToWidth>
      </div>
    </>
  );
}

function reportBlocks(
  r: Report,
  period: Period,
  company?: CompanyOverview,
  dists?: Distribution[],
): Block[] {
  // Distributions completed within the period (v1 printPfReport).
  const inPeriod = (dists ?? []).filter((d) => {
    if (d.status !== "completed" || !d.completedAt) return false;
    const day = new Date(d.completedAt * 1000).toISOString().slice(0, 10);
    return (!period.from || day >= period.from) && (!period.to || day <= period.to);
  });
  const t = r.totals;
  return [
    {
      key: "intro",
      node: (
        <>
          <h1 className="doc-title">التقرير المالي</h1>
          <div className="st-meta">
            <div>
              <p>
                <b>الجهة:</b> {r.org.name}
              </p>
              <p>
                <b>الفترة:</b> {periodText(period)}
              </p>
            </div>
            <div>
              <p>
                <b>تاريخ الإصدار:</b> {fromEpoch(r.generatedAt)}
              </p>
              <p>
                <b>عدد المشاريع:</b> {t.projects}
              </p>
            </div>
          </div>
        </>
      ),
    },
    ...section(
      "sum",
      "الملخص",
      [50, 50],
      ["البند", "المبلغ"],
      [
        ["قيمة العقود (شامل الضريبة)", sar(t.gross)],
        ["قيمة العقود قبل الضريبة", sar(t.net)],
        ["ضريبة القيمة المضافة", sar(t.vat)],
        ["المصروفات", sar(t.spent)],
        ["صافي الربح", `${sar(t.profit)} (هامش ${pct(t.margin)})`],
        ["المتبقي من العقود", sar(t.remaining)],
        ["قيود معلّقة", sar(t.pending)],
        ["بنود اتفاقية غير مسجّلة", sar(t.unregistered)],
      ],
    ),
    ...section(
      "prj",
      "ربحية المشاريع",
      [30, 18, 16, 18, 8, 10],
      ["المشروع", "قيمة العقد", "المصروف", "صافي الربح", "الهامش", "الحالة"],
      [...r.projects]
        .sort((a, b) => b.profit - a.profit)
        .map((p) => [
          <>
            {p.name}
            <span className="st-sub">
              {p.clientName} · <span dir="ltr">{p.number}</span>
            </span>
          </>,
          sar(p.gross),
          sar(p.spent),
          sar(p.profit),
          pct(p.margin),
          p.hasFinance ? "—" : "بلا مالية",
        ]),
      ["الإجمالي", sar(t.gross), sar(t.spent), sar(t.profit), pct(t.margin), ""],
    ),
    ...section(
      "mon",
      "الحركة الشهرية",
      [40, 30, 30],
      ["الشهر", "الإيرادات", "المصروفات"],
      r.monthly.map((m) => [monthLabel(m.month), sar(m.income), sar(m.expense)]),
    ),
    ...section(
      "cat",
      "المصروفات حسب التصنيف",
      [60, 40],
      ["التصنيف", "المبلغ"],
      r.categories.map((c) => [c.label, sar(c.amount)]),
    ),
    ...section(
      "obl",
      "الالتزامات والمستحقات",
      [45, 30, 25],
      ["البند", "المشروع", "المبلغ"],
      [
        ...r.obligations.unregistered.map((u) => [
          `${u.item} (غير مسجّل)`,
          u.projectName,
          sar(u.amount),
        ]),
        ...r.obligations.pending.map((p) => [
          `${p.description} (معلّق ${day(p.date)})`,
          p.projectName,
          sar(p.amount),
        ]),
      ],
    ),
    ...section(
      "vat",
      "ضريبة القيمة المضافة حسب المشروع",
      [40, 30, 30],
      ["المشروع", "قبل الضريبة", "الضريبة"],
      r.projects.filter((p) => p.vat > 0).map((p) => [p.name, sar(p.net), sar(p.vat)]),
      ["الإجمالي", sar(t.net), sar(t.vat)],
    ),
    ...(company
      ? section(
          "co",
          "مالية الشركة",
          [60, 40],
          ["البند", "المبلغ"],
          [
            ["أرباح المشاريع", sar(company.calc.projectProfit)],
            ["إيرادات الخدمات", sar(company.calc.serviceIncome)],
            ["مصروفات الشركة", sar(company.calc.companyExpenses)],
            ["صافي ربح الشركة", sar(company.calc.netProfit)],
            ["المتاح للتوزيع (كل الفترات)", sar(company.allTime.available)],
            ["المحتجز (تشغيل/تطوير/احتياطي)", sar(company.retained.total)],
          ],
        )
      : []),
    ...(company
      ? section(
          "dst",
          "توزيعات الأرباح المعتمدة في الفترة",
          [40, 20, 20, 20],
          ["التوزيع", "الموزَّع", "المحتجز", "الشركاء"],
          inPeriod.map((d) => [
            d.periodLabel || "توزيع",
            sar(d.distributed),
            sar(d.retained),
            d.shares.map((x) => `${x.partnerName} ${sar(x.amount)}`).join("، "),
          ]),
        )
      : []),
    {
      key: "note",
      node: (
        <p className="st-note">
          تُحسب الأرقام من مالية كل مشروع. المشاريع تدخل الفترة بتاريخ عقدها، والقيود بتاريخها.
        </p>
      ),
    },
  ];
}

const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;

/** One CSV (UTF-8 BOM for Excel) with titled sections. */
export function reportCsv(r: Report, period: Period) {
  const t = r.totals;
  const lines: (string | number)[][] = [
    ["التقرير المالي", r.org.name],
    ["الفترة", periodText(period)],
    [],
    ["الملخص"],
    ["قيمة العقود (شامل الضريبة)", t.gross],
    ["قيمة العقود قبل الضريبة", t.net],
    ["ضريبة القيمة المضافة", t.vat],
    ["المصروفات", t.spent],
    ["صافي الربح", t.profit],
    ["هامش الربح %", t.margin],
    ["المتبقي من العقود", t.remaining],
    [],
    ["ربحية المشاريع"],
    [
      "رقم المشروع",
      "المشروع",
      "العميل",
      "قيمة العقد",
      "قبل الضريبة",
      "الضريبة",
      "المصروف",
      "صافي الربح",
      "الهامش %",
      "المتبقي",
    ],
    ...r.projects.map((p) => [
      p.number,
      p.name,
      p.clientName,
      p.gross,
      p.net,
      p.vat,
      p.spent,
      p.profit,
      p.margin,
      p.remaining,
    ]),
    [],
    ["الحركة الشهرية"],
    ["الشهر", "الإيرادات", "المصروفات"],
    ...r.monthly.map((m) => [m.month, m.income, m.expense]),
    [],
    ["المصروفات حسب التصنيف"],
    ...r.categories.map((c) => [c.label, c.amount]),
    [],
    ["الالتزامات"],
    ["البند", "المشروع", "المبلغ"],
    ...r.obligations.unregistered.map((u) => [`${u.item} (غير مسجّل)`, u.projectName, u.amount]),
    ...r.obligations.pending.map((p) => [
      `${p.description} (معلّق ${p.date})`,
      p.projectName,
      p.amount,
    ]),
  ];
  return `﻿${lines.map((l) => l.map(cell).join(",")).join("\r\n")}`;
}

function downloadCsv(r: Report, period: Period) {
  void downloadSheet(
    `finance-report-${period.from || "all"}${period.to ? `-${period.to}` : ""}`,
    "التقرير المالي",
    csvToRows(reportCsv(r, period)),
  );
}
