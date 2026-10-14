import { ENTRY_STATUS_LABELS } from "@buad/schema/finance";
import { ok } from "../../lib/format";
import type { Finance } from "../finance/api";
import { catLabel } from "../finance/labels";
import { agreementRows } from "../finance/ProjectFinanceReport";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import type { OverviewProject } from "./api";

/**
 * «أرشيف Excel» (v1 pfExportArchive): one real .xlsx — a summary sheet of the chosen projects,
 * then a sheet per project with its contract, agreement report and every transaction.
 * exceljs loads only when an archive is made.
 */
export async function downloadArchive(projects: OverviewProject[]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "بُعد";
  wb.created = new Date();
  const head = { bold: true, color: { argb: "FFFFFFFF" } };
  const headFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF00197D" },
  };
  const money = "#,##0.00";
  const styleHead = (row: {
    eachCell: (fn: (c: { font: unknown; fill: unknown }) => void) => void;
  }) =>
    row.eachCell((c) => {
      c.font = head;
      c.fill = headFill;
    });

  const sum = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
  sum.columns = [
    { header: "رقم المشروع", key: "number", width: 16 },
    { header: "المشروع", key: "name", width: 34 },
    { header: "العميل", key: "client", width: 26 },
    { header: "الحالة", key: "status", width: 12 },
    { header: "قيمة العقد", key: "gross", width: 16, style: { numFmt: money } },
    { header: "الضريبة", key: "vat", width: 14, style: { numFmt: money } },
    { header: "المصروف", key: "spent", width: 16, style: { numFmt: money } },
    { header: "صافي الربح", key: "profit", width: 16, style: { numFmt: money } },
    { header: "الهامش %", key: "margin", width: 10 },
    { header: "المتبقي", key: "remaining", width: 16, style: { numFmt: money } },
  ];
  styleHead(sum.getRow(1));
  for (const p of projects)
    sum.addRow({
      number: p.number,
      name: p.name,
      client: p.clientName,
      status: label(PROJECT_STATUS_LABELS, p.status),
      gross: p.gross,
      vat: p.vat,
      spent: p.spent,
      profit: p.profit,
      margin: p.margin,
      remaining: p.remaining,
    });
  const total = sum.addRow({
    name: "الإجمالي",
    gross: projects.reduce((a, p) => a + p.gross, 0),
    vat: projects.reduce((a, p) => a + p.vat, 0),
    spent: projects.reduce((a, p) => a + p.spent, 0),
    profit: projects.reduce((a, p) => a + p.profit, 0),
    remaining: projects.reduce((a, p) => a + p.remaining, 0),
  });
  total.font = { bold: true };

  const used = new Set<string>();
  for (const p of projects) {
    const fin = await ok<Finance>(await fetch(`/api/projects/${encodeURIComponent(p.id)}/finance`));
    // Sheet names: max 31 chars, unique, no []:*?/\
    let name = `${p.number} ${p.name}`
      .replace(/[[\]:*?/\\]/g, " ")
      .slice(0, 31)
      .trim();
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 27)} (${i})`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }] });
    ws.columns = [
      { key: "a", width: 14 },
      { key: "b", width: 40 },
      { key: "c", width: 22 },
      { key: "d", width: 12 },
      { key: "e", width: 12 },
      { key: "f", width: 16, style: { numFmt: money } },
    ];
    const s = fin.summary;
    ws.addRow([p.name]).font = { bold: true, size: 14 };
    ws.addRow([`العميل: ${p.clientName}`, `رقم المشروع: ${p.number}`]);
    ws.addRow([]);
    for (const [k, v] of [
      ["قيمة العقد الكاملة", s.grossTotal],
      ["الضريبة", s.vatAmt],
      ["إجمالي المصروف", s.totalDeductions],
      ["صافي الربح", s.profit],
      ["المتبقي", s.remainingFromGross],
    ] as const) {
      const r = ws.addRow([k, "", "", "", "", v]);
      r.getCell(1).font = { bold: true };
    }
    ws.addRow([]);
    styleHead(ws.addRow(["تقرير الاتفاقية", "الأساس", "", "", "المسجّل", "المتفق عليه"]));
    for (const r of agreementRows(fin))
      ws.addRow([r.label, r.basis, "", "", r.registered, r.agreed]);
    ws.addRow([]);
    styleHead(ws.addRow(["التاريخ", "البيان", "التصنيف", "النوع", "الحالة", "المبلغ"]));
    for (const e of [...fin.entries].sort((a, b) => a.date.localeCompare(b.date)))
      ws.addRow([
        e.date,
        e.description,
        catLabel(e.cat, fin.categories, fin.budget),
        e.type === "income" ? "دخل" : "مصروف",
        ENTRY_STATUS_LABELS[e.status] || "",
        e.amount / 100,
      ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  a.download = `projects-archive-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
