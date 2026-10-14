import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge, Card, EmptyState, Notice } from "../../components/ui";
import { pct, sar } from "../../lib/format";
import { overviewQuery, STATUS_LABEL } from "./products-api";

/** «نظرة عامة»: the services side by side, to see which earns, repeats and converts. */
export function PortfolioOverview() {
  const q = useQuery(overviewQuery);
  if (q.isPending)
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!q.data) return <Notice>تعذّر تحميل النظرة العامة</Notice>;
  const { products, unlinkedProjects } = q.data;
  if (!products.length)
    return (
      <EmptyState title="لا خدمات بعد" text="أنشئ خدمة من تبويب «المنتجات» لتظهر مقارنتها هنا." />
    );
  return (
    <div className="space-y-4">
      {unlinkedProjects > 0 && (
        <Notice tone="amber">
          {unlinkedProjects} مشروع غير مرتبط بأي خدمة، فلا يدخل في هذه الأرقام.{" "}
          <Link to="/projects" search={{ product: "none" }} className="underline">
            عرضها
          </Link>{" "}
          ثم اربطها من خطوة «الأداء» في كل خدمة.
        </Notice>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted">
            <tr>
              <th className="p-3 text-start font-medium">الخدمة</th>
              <th className="p-3 text-start font-medium">المشاريع</th>
              <th className="p-3 text-start font-medium">الجهات</th>
              <th className="p-3 text-start font-medium">قيمة العقود</th>
              <th className="p-3 text-start font-medium">الربح</th>
              <th className="p-3 text-start font-medium">الهامش الفعلي / المخطط</th>
              <th className="p-3 text-start font-medium">الطلبات</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-brand-soft/50">
                <td className="p-3">
                  <Link
                    to="/products/$id"
                    params={{ id: p.id }}
                    search={{ step: "performance" }}
                    className="font-semibold hover:text-brand"
                  >
                    {p.name}
                  </Link>
                  <div className="mt-0.5">
                    <Badge tone={p.status === "published" ? "green" : "gray"}>
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                </td>
                <td className="p-3">{p.projects}</td>
                <td className="p-3">
                  {p.entities}
                  {p.repeatEntities > 0 && (
                    <span className="block text-xs text-emerald-700 dark:text-emerald-300">
                      {p.repeatEntities} كررت
                    </span>
                  )}
                </td>
                <td className="p-3">{sar(p.contractNet)}</td>
                <td className={`p-3 ${p.profit < 0 ? "text-red-600" : ""}`}>{sar(p.profit)}</td>
                <td className="p-3">
                  {p.projects ? pct(p.marginPct) : "—"}
                  <span className="text-muted">
                    {" "}
                    / {p.plannedMarginPct !== null ? pct(p.plannedMarginPct) : "—"}
                  </span>
                </td>
                <td className="p-3">
                  {p.requests ? `${p.won}/${p.requests}` : "—"}
                  {p.requests > 0 && (
                    <span className="block text-xs text-muted">تحويل {pct(p.conversionPct)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
