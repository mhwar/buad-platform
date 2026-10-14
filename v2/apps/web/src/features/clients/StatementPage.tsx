import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { Button, EmptyState, Notice } from "../../components/ui";
import { fromEpoch, sar } from "../../lib/format";
import { FitToWidth } from "../documents/FitToWidth";
import { type Block, PagedSheets } from "../documents/Pages";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import { type Statement, statementQuery } from "./api";

const route = getRouteApi("/clients/$id/statement");
const SHEET_STYLE = {
  "--doc-fs": "10pt",
  "--doc-lh": 1.6,
  "--doc-mx": "1.6cm",
} as React.CSSProperties;

const COLUMNS = [
  ["gross", "قيمة العقد (شامل الضريبة)"],
  ["vat", "الضريبة"],
  ["spent", "المصروف"],
  ["remaining", "المتبقي"],
] as const;

/** «كشف حساب»: the client's projects with contract value, VAT, spending and remaining, on the letterhead. */
export function StatementPage() {
  const { id } = route.useParams();
  const q = useQuery(statementQuery(id));
  if (q.isPending)
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="تعذّر إعداد كشف الحساب"
        action={<Button onClick={() => q.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const st = q.data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <nav className="mb-1 text-sm text-muted">
            <Link to="/clients/$id" params={{ id }} className="hover:text-ink">
              ← {st.client.name}
            </Link>
          </nav>
          <h1 className="text-xl font-bold">كشف حساب</h1>
          <p className="text-xs text-muted">
            {st.items.length} مشروع · بتاريخ {fromEpoch(st.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCsv(st)}>
            <Download className="size-4" /> تصدير Excel
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة / PDF
          </Button>
        </div>
      </div>
      {st.items.some((i) => !i.hasFinance) && (
        <div className="print:hidden">
          <Notice tone="amber">
            بعض المشاريع لم تُسجَّل لها مالية بعد، فتظهر قيمتها المتوقعة ولا مصروفات لها.
          </Notice>
        </div>
      )}
      <div className="print-root rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
        <FitToWidth>
          <PagedSheets
            title={`كشف حساب ${st.client.name}`}
            style={SHEET_STYLE}
            header={st.org.urls.headerAsset}
            footer={st.org.urls.footerAsset}
            blocks={statementBlocks(st)}
            repeat={<HeadRow />}
          />
        </FitToWidth>
      </div>
    </>
  );
}

/** Fixed column widths, so the one-row tables of each page line up as a single table. */
function Cols() {
  return (
    <colgroup>
      <col style={{ width: "28%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "18%" }} />
      <col style={{ width: "14%" }} />
      <col style={{ width: "15%" }} />
      <col style={{ width: "15%" }} />
    </colgroup>
  );
}

function HeadRow() {
  return (
    <table className="st-table">
      <Cols />
      <thead>
        <tr>
          <th>المشروع</th>
          <th>الحالة</th>
          {COLUMNS.map(([k, l]) => (
            <th key={k}>{l}</th>
          ))}
        </tr>
      </thead>
    </table>
  );
}

/** The statement as page blocks: intro, header, one block per project, totals, note. */
function statementBlocks(st: Statement): Block[] {
  const c = st.client;
  return [
    {
      key: "intro",
      node: (
        <>
          <h1 className="doc-title">كشف حساب عميل</h1>
          <div className="st-meta">
            <div>
              <p>
                <b>العميل:</b> {c.name}
              </p>
              {c.regNo && (
                <p>
                  <b>السجل:</b> <span dir="ltr">{c.regNo}</span>
                </p>
              )}
              {c.taxNo && (
                <p>
                  <b>الرقم الضريبي:</b> <span dir="ltr">{c.taxNo}</span>
                </p>
              )}
              {(c.address || c.city) && (
                <p>
                  <b>العنوان:</b> {[c.address, c.city].filter(Boolean).join("، ")}
                </p>
              )}
            </div>
            <div>
              <p>
                <b>رقم العميل:</b> <span dir="ltr">{c.code}</span>
              </p>
              <p>
                <b>التاريخ:</b> {fromEpoch(st.generatedAt)}
              </p>
              <p>
                <b>عدد المشاريع:</b> {st.items.length}
              </p>
            </div>
          </div>
        </>
      ),
    },
    { key: "head", keepWithNext: true, node: <HeadRow /> },
    ...st.items.map((i) => ({
      key: i.id,
      node: (
        <table className="st-table st-cont">
          <Cols />
          <tbody>
            <tr>
              <td>
                {i.name}
                <span className="st-sub" dir="ltr">
                  {i.number}
                  {i.contractNo && ` · ${i.contractNo}`}
                </span>
              </td>
              <td>{label(PROJECT_STATUS_LABELS, i.status)}</td>
              {COLUMNS.map(([k]) => (
                <td key={k} className="st-num">
                  {sar(i[k])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ),
    })),
    {
      key: "totals",
      keepWithPrev: true,
      node: (
        <table className="st-table st-cont st-totals">
          <Cols />
          <tbody>
            <tr>
              <td colSpan={2}>الإجمالي</td>
              {COLUMNS.map(([k]) => (
                <td key={k} className="st-num">
                  {sar(st.totals[k])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ),
    },
    {
      key: "note",
      node: (
        <p className="st-note">
          المتبقي = قيمة العقد شامل الضريبة ناقص كل القيود المسجلة في مالية المشروع (المصروفات وبنود
          الاتفاقية). صادر من {st.org.name}.
        </p>
      ),
    },
  ];
}

const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;

/** CSV with a UTF-8 BOM so Excel opens the Arabic text correctly. */
export function statementCsv(st: Statement) {
  const head = [
    "رقم المشروع",
    "المشروع",
    "الحالة",
    "رقم العقد",
    "قيمة العقد قبل الضريبة",
    "الضريبة",
    "قيمة العقد شامل الضريبة",
    "المصروف",
    "المتبقي",
  ];
  const rows = st.items.map((i) => [
    i.number,
    i.name,
    label(PROJECT_STATUS_LABELS, i.status),
    i.contractNo,
    i.contractNet,
    i.vat,
    i.gross,
    i.spent,
    i.remaining,
  ]);
  const t = st.totals;
  rows.push(["", "الإجمالي", "", "", t.contractNet, t.vat, t.gross, t.spent, t.remaining]);
  return `﻿${[head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}`;
}

function downloadCsv(st: Statement) {
  const blob = new Blob([statementCsv(st)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  // ASCII name: some browsers drop non-Latin download names.
  a.download = `statement-${st.client.code}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
