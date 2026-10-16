import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Segmented } from "../../components/ui";
import { exportTable } from "../../lib/export";
import { ok } from "../../lib/format";
import type { PeriodChoice } from "../finance-overview/api";
import { PeriodPicker } from "../finance-overview/PeriodPicker";
import { Figure, ReportFrame } from "./ReportFrame";
import { periodOf } from "./ReportsPage";

const route = getRouteApi("/reports/execution");
type Line = {
  key: string;
  name: string;
  open: number;
  late: number;
  done: number;
  onTime: number;
  minutes: number;
};
type Execution = {
  period: { from: string; to: string };
  totals: Omit<Line, "key" | "name">;
  people: Line[];
  projects: Line[];
};
const hours = (m: number) => (m ? `${Math.round((m / 60) * 10) / 10} س` : "—");
const rate = (l: { done: number; onTime: number }) =>
  l.done ? `${Math.round((l.onTime / l.done) * 100)}%` : "—";

/** «التنفيذ والإنتاجية»: per person and per project — open, late, done (and on time), and hours. */
export function ExecutionReport() {
  const s = route.useSearch();
  const nav = route.useNavigate();
  const [by, setBy] = useState<"people" | "projects">("people");
  const choice: PeriodChoice =
    s.from || s.to ? { preset: "custom", from: s.from, to: s.to } : { preset: "all" };
  const q = useQuery({
    queryKey: ["reports", "execution", s.from ?? "", s.to ?? ""],
    queryFn: async () =>
      ok<Execution>(
        await fetch(
          `/api/reports/execution?${new URLSearchParams({ ...(s.from ? { from: s.from } : {}), ...(s.to ? { to: s.to } : {}) })}`,
        ),
      ),
  });
  const d = q.data;
  const rows = d ? (by === "people" ? d.people : d.projects) : [];
  const excel = () =>
    exportTable(
      by === "people" ? "التنفيذ حسب الأشخاص" : "التنفيذ حسب المشاريع",
      [
        { header: by === "people" ? "الشخص" : "المشروع", value: (l: Line) => l.name, width: 28 },
        { header: "مفتوحة", value: (l) => l.open },
        { header: "متأخرة", value: (l) => l.late },
        { header: "أُنجزت في الفترة", value: (l) => l.done, width: 18 },
        { header: "في موعدها", value: (l) => rate(l) },
        { header: "الساعات", value: (l) => Math.round((l.minutes / 60) * 10) / 10 },
      ],
      rows,
      "xlsx",
      `execution-${by}-${d?.period.from ?? "all"}`,
    );
  return (
    <ReportFrame
      title="التنفيذ والإنتاجية"
      subtitle={d && (s.from || s.to) ? `من ${d.period.from} إلى ${d.period.to}` : "كل الفترات"}
      onExcel={rows.length ? excel : undefined}
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker
            value={choice}
            onChange={(v) => {
              const p = periodOf(v);
              nav({
                search: p
                  ? { from: p.from, to: p.to }
                  : v.preset === "custom"
                    ? { from: v.from, to: v.to }
                    : {},
                replace: true,
              });
            }}
          />
          <Segmented
            label="التجميع"
            value={by}
            onChange={setBy}
            items={[
              { value: "people", label: "حسب الأشخاص" },
              { value: "projects", label: "حسب المشاريع" },
            ]}
          />
        </div>
      }
    >
      {d && (
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 sm:grid-cols-5 dark:bg-slate-800">
          <Figure label="مهام مفتوحة" value={String(d.totals.open)} />
          <Figure
            label="متأخرة"
            value={String(d.totals.late)}
            tone={d.totals.late ? "bad" : undefined}
          />
          <Figure label="أُنجزت في الفترة" value={String(d.totals.done)} tone="good" />
          <Figure label="أُنجزت في موعدها" value={rate(d.totals)} />
          <Figure label="الساعات المسجلة" value={hours(d.totals.minutes)} />
        </ul>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b bg-canvas/60 text-xs text-muted">
            <tr>
              {[
                by === "people" ? "الشخص" : "المشروع",
                "مفتوحة",
                "متأخرة",
                "أُنجزت",
                "في موعدها",
                "الساعات",
              ].map((h) => (
                <th key={h} className="p-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key || "none"} className="border-b last:border-0">
                <td className="p-3 font-medium">{l.name}</td>
                <td className="p-3 tabular-nums">{l.open}</td>
                <td className={`p-3 tabular-nums ${l.late ? "font-semibold text-red-600" : ""}`}>
                  {l.late}
                </td>
                <td className="p-3 tabular-nums">{l.done}</td>
                <td className="p-3 tabular-nums">{rate(l)}</td>
                <td className="p-3 tabular-nums">{hours(l.minutes)}</td>
              </tr>
            ))}
            {d && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  لا مهام بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </ReportFrame>
  );
}
