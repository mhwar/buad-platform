import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Card, Segmented } from "../../components/ui";
import { exportTable } from "../../lib/export";
import { day, money } from "../../lib/format";
import { label, PROJECT_STATUS_LABELS, STATUS_TONE } from "../labels";
import { type ProjectListItem, projectsQuery } from "../projects/api";
import { workShare } from "../projects/ProjectsPage";
import { Figure, ReportFrame } from "./ReportFrame";

type Scope = "running" | "all";
const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * «محفظة المشاريع»: every project on one sheet — work done, deadline, money in and money due —
 * with the totals that matter to whoever runs the portfolio.
 */
export function PortfolioReport() {
  const [scope, setScope] = useState<Scope>("running");
  const q = useQuery(
    projectsQuery({ sort: "deadline", status: scope === "running" ? "active" : undefined }),
  );
  const items = q.data?.items ?? [];
  const money_ = items.some((p) => p.received !== null && p.received !== undefined);
  const contract = items.reduce((s, p) => s + p.contractTotal, 0);
  const received = items.reduce((s, p) => s + (p.received ?? 0), 0);
  const late = items.filter((p) => p.late).length;
  const dueLate = items.filter(
    (p) => p.nextDueDate && p.nextDueDate < new Date().toISOString().slice(0, 10),
  ).length;
  const work = (p: ProjectListItem) => {
    const w = workShare(p);
    return w ? w.done / w.total : null;
  };
  const excel = () =>
    exportTable(
      "محفظة المشاريع",
      [
        { header: "رقم المشروع", value: (p: ProjectListItem) => p.number, width: 16 },
        { header: "المشروع", value: (p) => p.name, width: 32 },
        { header: "العميل", value: (p) => p.clientName, width: 26 },
        { header: "الحالة", value: (p) => label(PROJECT_STATUS_LABELS, p.status) },
        { header: "الانتهاء", value: (p) => p.endDate },
        { header: "متأخر", value: (p) => (p.late ? "نعم" : "") },
        {
          header: "التنفيذ",
          value: (p) => {
            const w = work(p);
            return w === null ? "" : pct(w);
          },
        },
        { header: "قيمة العقد", value: (p) => p.contractTotal / 100, money: true, width: 16 },
        ...(money_
          ? [
              {
                header: "المحصّل",
                value: (p: ProjectListItem) => (p.received ?? 0) / 100,
                money: true,
                width: 16,
              },
              {
                header: "المتبقي على العميل",
                value: (p: ProjectListItem) =>
                  Math.max(0, p.contractTotal - (p.received ?? 0)) / 100,
                money: true,
                width: 18,
              },
              { header: "الدفعة القادمة", value: (p: ProjectListItem) => p.nextDueDate ?? "" },
            ]
          : []),
      ],
      items,
      "xlsx",
      `portfolio-${new Date().toISOString().slice(0, 10)}`,
    );

  return (
    <ReportFrame
      title="محفظة المشاريع"
      subtitle={`${items.length} مشروع · مرتبة بالأقرب انتهاءً`}
      onExcel={items.length ? excel : undefined}
      controls={
        <Segmented<Scope>
          label="النطاق"
          value={scope}
          onChange={setScope}
          items={[
            { value: "running", label: "الجارية" },
            { value: "all", label: "كل المشاريع" },
          ]}
        />
      }
    >
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 sm:grid-cols-4 dark:bg-slate-800">
        <Figure label="قيمة العقود" value={money(contract)} />
        {money_ ? (
          <Figure
            label="المحصّل"
            value={`${money(received)} · ${contract ? pct(received / contract) : "—"}`}
            tone="good"
          />
        ) : (
          <Figure label="المشاريع" value={String(items.length)} />
        )}
        <Figure label="متأخرة عن موعدها" value={String(late)} tone={late ? "bad" : undefined} />
        <Figure
          label="عليها دفعة متأخرة"
          value={money_ ? String(dueLate) : "—"}
          tone={dueLate ? "bad" : undefined}
        />
      </ul>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b bg-canvas/60 text-xs text-muted">
            <tr>
              {[
                "المشروع",
                "العميل",
                "الحالة",
                "الانتهاء",
                "التنفيذ",
                "قيمة العقد",
                ...(money_ ? ["المحصّل", "الدفعة القادمة"] : []),
              ].map((h) => (
                <th key={h} className="p-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const w = work(p);
              return (
                <tr
                  key={p.id}
                  className={`border-b last:border-0 ${p.late ? "bg-red-50/60 dark:bg-red-950/20" : ""}`}
                >
                  <td className="p-3">
                    <Link
                      to="/projects/$id"
                      params={{ id: p.id }}
                      className="font-semibold hover:text-brand"
                    >
                      {p.name}
                    </Link>
                    <span className="block text-xs text-muted" dir="ltr">
                      {p.number}
                    </span>
                  </td>
                  <td className="p-3">{p.clientName}</td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[p.status]}>
                      {label(PROJECT_STATUS_LABELS, p.status)}
                    </Badge>
                  </td>
                  <td
                    className={`p-3 whitespace-nowrap ${p.late ? "font-semibold text-red-600" : ""}`}
                  >
                    {p.endDate ? day(p.endDate) : "—"}
                    {p.late && " · متأخر"}
                  </td>
                  <td className="p-3 tabular-nums">{w === null ? "—" : pct(w)}</td>
                  <td className="p-3 tabular-nums">
                    {money(p.contractTotal)}
                    {p.estimated && <span className="ms-1 text-[11px] text-muted">تقديري</span>}
                  </td>
                  {money_ && (
                    <>
                      <td className="p-3 tabular-nums">{money(p.received ?? 0)}</td>
                      <td className="p-3 whitespace-nowrap">
                        {p.nextDueDate
                          ? `${money(p.nextDueAmount ?? 0)} · ${day(p.nextDueDate)}`
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot className="border-t bg-canvas/60 font-semibold">
              <tr>
                <td className="p-3" colSpan={5}>
                  الإجمالي
                </td>
                <td className="p-3 tabular-nums">{money(contract)}</td>
                {money_ && (
                  <>
                    <td className="p-3 tabular-nums">{money(received)}</td>
                    <td />
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </ReportFrame>
  );
}
