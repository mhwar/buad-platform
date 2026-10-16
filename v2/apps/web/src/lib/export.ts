/** A column of an exported table: its header and how to read a row (money is in riyals). */
export type Column<T> = {
  header: string;
  value: (row: T) => string | number;
  money?: boolean;
  width?: number;
};

const csvCell = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  // Attached while clicked, so every browser keeps the file name.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * One way to export any report table: a real Excel workbook (right-to-left, bold header, number
 * formats) or a plain CSV. exceljs loads only when a workbook is made.
 */
export async function exportTable<T>(
  name: string,
  columns: Column<T>[],
  rows: T[],
  format: "xlsx" | "csv" = "xlsx",
  /** The file's name (Latin letters: some browsers drop Arabic download names). */
  file = "report",
) {
  if (format === "csv") {
    const lines = [columns.map((c) => csvCell(c.header)).join(",")].concat(
      rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")),
    );
    // BOM so Excel opens Arabic correctly.
    save(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }), `${file}.csv`);
    return;
  }
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "بُعد";
  wb.created = new Date();
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: true }] });
  ws.columns = columns.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: c.width ?? Math.max(12, c.header.length + 4),
    ...(c.money ? { style: { numFmt: "#,##0.00" } } : {}),
  }));
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c, i) => [`c${i}`, c.value(r)])));
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00197D" } };
  });
  const buf = await wb.xlsx.writeBuffer();
  save(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${file}.xlsx`,
  );
}

/** Reads the CSV the platform's report builders write back into rows (numbers become numbers). */
export function csvToRows(csv: string): (string | number)[][] {
  const text = csv.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (/^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c)));
}

/**
 * A ready-made sheet (sections, headings and tables as rows) saved as a real Excel file:
 * right-to-left, with the lines that look like headings in bold.
 */
export async function downloadSheet(file: string, sheet: string, rows: (string | number)[][]) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "بُعد";
  const ws = wb.addWorksheet(sheet.slice(0, 31), { views: [{ rightToLeft: true }] });
  for (const r of rows) {
    const added = ws.addRow(r);
    // A row of text only, after an empty row or at the top, reads as a heading.
    if (r.length > 1 && r.every((c) => typeof c === "string" && c !== ""))
      added.font = { bold: true };
    added.eachCell((cell) => {
      if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
    });
  }
  ws.columns.forEach((col) => {
    let w = 10;
    col.eachCell?.({ includeEmpty: false }, (c) => {
      w = Math.max(w, Math.min(48, String(c.value ?? "").length + 2));
    });
    col.width = w;
  });
  const buf = await wb.xlsx.writeBuffer();
  save(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${file}.xlsx`,
  );
}
