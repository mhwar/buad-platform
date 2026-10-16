import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { Button, EmptyState } from "../../components/ui";
import { csvToRows, downloadSheet } from "../../lib/export";
import { day, fromEpoch, sar } from "../../lib/format";
import { FitToWidth } from "../documents/FitToWidth";
import { type Block, PagedSheets } from "../documents/Pages";
import { PdfButton } from "../documents/PdfButton";
import { orgProfileQuery } from "../org/OrgSettings";
import { SHEET_STYLE } from "./ReportPage";
import { section } from "./report-blocks";
import { GAP_TEXT, type VatReport, vatReportQuery } from "./vat-api";

const route = getRouteApi("/finance/vat/report");

/**
 * «تقرير ضريبة القيمة المضافة»: the quarter on the letterhead — the return lines in the order
 * of the ZATCA form, then the sales and purchases ledgers behind every figure.
 */
export function VatReportPage() {
  const { year, q } = route.useSearch();
  const r = useQuery(vatReportQuery(year, q));
  const org = useQuery(orgProfileQuery);
  if (!r.data || !org.data)
    return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (r.isError)
    return (
      <EmptyState
        title="تعذّر إعداد التقرير"
        action={<Button onClick={() => r.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const v = r.data;
  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link to="/finance" search={{ tab: "vat" }} className="text-sm text-muted hover:text-ink">
            ← الضريبة
          </Link>
          <h1 className="text-xl font-bold">تقرير ضريبة القيمة المضافة</h1>
          <p className="text-xs text-muted">{v.period.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCsv(v)}>
            <Download className="size-4" /> Excel
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
          <PdfButton path={`/finance/vat/report?year=${year}&q=${q}`} name={`vat-${year}-Q${q}`} />
        </div>
      </div>
      <div className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
        <FitToWidth>
          <PagedSheets
            title="تقرير ضريبة القيمة المضافة"
            style={SHEET_STYLE}
            header={org.data.urls.headerAsset}
            footer={org.data.urls.footerAsset}
            blocks={blocks(v, org.data.name ?? "")}
          />
        </FitToWidth>
      </div>
    </div>
  );
}

function blocks(v: VatReport, orgName: string): Block[] {
  const out: Block[] = [
    {
      key: "intro",
      node: (
        <>
          <h1 className="doc-title">تقرير ضريبة القيمة المضافة</h1>
          <div className="st-meta">
            <div>
              <p>
                <b>المنشأة:</b> {orgName}
              </p>
              <p>
                <b>الرقم الضريبي:</b>{" "}
                {v.vatNumber ? <span dir="ltr">{v.vatNumber}</span> : "غير مسجّل"}
              </p>
            </div>
            <div>
              <p>
                <b>الفترة:</b> {v.period.label}
              </p>
              <p>
                <b>من:</b> {day(v.period.from)} <b>إلى:</b> {day(v.period.to)}
              </p>
              <p>
                <b>تاريخ الإصدار:</b> {fromEpoch(Math.floor(Date.now() / 1000))}
              </p>
            </div>
          </div>
        </>
      ),
    },
    ...section(
      "ret",
      "بيانات الإقرار",
      [58, 21, 21],
      ["البند", "المبلغ (قبل الضريبة)", "مبلغ الضريبة"],
      [
        ["المبيعات الخاضعة للنسبة الأساسية", sar(v.sales.base), sar(v.sales.vat)],
        ["المشتريات المحلية الخاضعة للنسبة الأساسية", sar(v.purchases.base), sar(v.purchases.vat)],
      ],
      [
        v.netPayable >= 0 ? "صافي الضريبة المستحقة" : "صافي الضريبة المستردة",
        "",
        sar(Math.abs(v.netPayable)),
      ],
    ),
  ];
  if (v.warnings.length)
    out.push({
      key: "warn",
      node: (
        <p className="st-note">
          تنبيهات على اكتمال البيانات:{" "}
          {v.warnings
            .map((w) =>
              w.code === "no_vat_number"
                ? "الرقم الضريبي غير مسجّل"
                : w.code === "projects_without_receipts"
                  ? `${w.count} مشروع بلا استلام معتمد`
                  : w.code === "invoice_incomplete"
                    ? `${w.count} فاتورة مشتريات ناقصة البيانات`
                    : `${w.count} مصروف لم يُحدَّد`,
            )
            .join(" · ")}
          .
        </p>
      ),
    });
  out.push(
    ...section(
      "sal",
      "سجل المبيعات: الاستلامات المعتمدة",
      [14, 34, 18, 18, 16],
      ["تاريخ الاستلام", "المشروع / العميل", "المستلم", "قبل الضريبة", "الضريبة"],
      v.sales.rows.map((s) => [
        day(s.date),
        <>
          {s.name}
          <span className="st-sub">{s.clientName}</span>
        </>,
        sar(s.amount),
        sar(s.base),
        sar(s.vat),
      ]),
      ["الإجمالي", "", sar(v.sales.total), sar(v.sales.base), sar(v.sales.vat)],
    ),
    ...section(
      "pur",
      "سجل المشتريات: الفواتير الضريبية",
      [13, 31, 15, 14, 14, 13],
      [
        "تاريخ الفاتورة",
        "البيان / المورد",
        "رقم الفاتورة",
        "الرقم الضريبي",
        "قبل الضريبة",
        "الضريبة",
      ],
      v.purchases.rows.map((p) => [
        day(p.date),
        <>
          {p.description}
          <span className="st-sub">
            {p.supplierName || "—"}
            {p.gaps.length ? ` · ناقص: ${p.gaps.map((g) => GAP_TEXT[g]).join("، ")}` : ""}
          </span>
        </>,
        <span dir="ltr" key="n">
          {p.invoiceNo || "—"}
        </span>,
        <span dir="ltr" key="v">
          {p.supplierVatNo || "—"}
        </span>,
        sar(p.base),
        sar(p.vat),
      ]),
      ["الإجمالي", "", "", "", sar(v.purchases.base), sar(v.purchases.vat)],
    ),
  );
  if (v.unidentified.rows.length)
    out.push(
      ...section(
        "unk",
        "مصروفات لم يُحدَّد لها فاتورة ضريبية (للمراجعة قبل الإقرار)",
        [14, 40, 26, 20],
        ["التاريخ", "البيان", "المشروع", "المبلغ"],
        v.unidentified.rows.map((u) => [day(u.date), u.description, u.projectName, sar(u.amount)]),
        ["الإجمالي", "", "", sar(v.unidentified.total)],
      ),
    );
  out.push({
    key: "note",
    node: (
      <p className="st-note">
        ضريبة المبيعات محسوبة بتاريخ استلام كل دفعة معتمدة، بنسبة ضريبة عقد كل مشروع. المشتريات
        بتاريخ فاتورتها، والضريبة فيها كما سُجّلت. صادر من {orgName}.
      </p>
    ),
  });
  return out;
}

const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
function downloadCsv(v: VatReport) {
  const lines: (string | number)[][] = [
    ["تقرير ضريبة القيمة المضافة", v.period.label],
    ["الرقم الضريبي", v.vatNumber],
    [],
    ["بيانات الإقرار", "قبل الضريبة", "الضريبة"],
    ["المبيعات الخاضعة", v.sales.base, v.sales.vat],
    ["المشتريات الخاضعة", v.purchases.base, v.purchases.vat],
    ["صافي الضريبة المستحقة (سالب = مستردة)", "", v.netPayable],
    [],
    ["سجل المبيعات"],
    ["تاريخ الاستلام", "المشروع", "العميل", "المستلم", "قبل الضريبة", "الضريبة"],
    ...v.sales.rows.map((s) => [s.date, s.name, s.clientName, s.amount, s.base, s.vat]),
    [],
    ["سجل المشتريات"],
    [
      "تاريخ الفاتورة",
      "البيان",
      "المورد",
      "الرقم الضريبي للمورد",
      "رقم الفاتورة",
      "قبل الضريبة",
      "الضريبة",
    ],
    ...v.purchases.rows.map((p) => [
      p.date,
      p.description,
      p.supplierName,
      p.supplierVatNo,
      p.invoiceNo,
      p.base,
      p.vat,
    ]),
    [],
    ["مصروفات لم تُحدَّد"],
    ["التاريخ", "البيان", "المشروع", "المبلغ"],
    ...v.unidentified.rows.map((u) => [u.date, u.description, u.projectName, u.amount]),
  ];
  // A real Excel file (the rows above, as they are).
  void downloadSheet(`vat-${v.period.from}-${v.period.to}`, "إقرار الضريبة", lines);
}
