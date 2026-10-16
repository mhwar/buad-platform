import { Link } from "@tanstack/react-router";
import { ChevronLeft, FileSpreadsheet, Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../components/ui";

/** The frame of a report page: the way back to «التقارير», its title and period, and its exports. */
export function ReportFrame({
  title,
  subtitle,
  onExcel,
  children,
  controls,
}: {
  title: string;
  subtitle?: string;
  onExcel?: () => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav
            aria-label="مسار التنقل"
            className="mb-1 flex items-center gap-1 text-sm text-muted print:hidden"
          >
            <Link to="/reports" className="hover:text-ink">
              التقارير
            </Link>
            <ChevronLeft className="size-3.5" />
          </nav>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {onExcel && (
            <Button variant="secondary" onClick={onExcel}>
              <FileSpreadsheet className="size-4" />
              Excel
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" />
            طباعة / PDF
          </Button>
        </div>
      </div>
      {controls && <div className="print:hidden">{controls}</div>}
      {children}
    </div>
  );
}

/** A number on a report: what it is, and the figure. */
export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
}) {
  return (
    <li className="bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}
      >
        {value}
      </p>
    </li>
  );
}
