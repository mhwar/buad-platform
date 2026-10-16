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
  a.click();
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
) {
  if (format === "csv") {
    const lines = [columns.map((c) => csvCell(c.header)).join(",")].concat(
      rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(",")),
    );
    // BOM so Excel opens Arabic correctly.
    save(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
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
    `${name}.xlsx`,
  );
}
