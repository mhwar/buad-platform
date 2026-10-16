import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { StatTile } from "../../components/StatTile";
import { Badge, Button, Card, Notice, Select } from "../../components/ui";
import { ok, pct, sar } from "../../lib/format";
import { label, PROJECT_STATUS_LABELS, STATUS_TONE } from "../labels";
import {
  insightText,
  type Product,
  productQuery,
  type StatProjectRow,
  sendJson,
  statsQuery,
  unlinkedQuery,
} from "./products-api";

const Tile = (r: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) => (
  <StatTile {...r} />
);

/** «الأداء»: what this service has actually done: projects, entities, packages, money, requests. */
export function PerformancePanel({ product }: { product: Product }) {
  const q = useQuery(statsQuery(product.id));
  if (q.isPending)
    return <div className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!q.data) return <Notice>تعذّر تحميل أداء الخدمة</Notice>;
  const { stats: s, projects } = q.data;
  const t = s.totals;
  const maxQ = Math.max(1, ...s.trend.map((x) => x.contractNet));
  return (
    <div className="space-y-8">
      {s.insights.length > 0 && (
        <ul className="space-y-2">
          {s.insights.map((i) => {
            const x = insightText(i);
            return (
              <li key={i.code}>
                <Notice tone={x.tone === "warn" ? "amber" : "blue"}>{x.text}</Notice>
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="المشاريع المنفذة"
            value={String(t.projects)}
            hint={`${t.completed} مكتمل · ${t.active} جارٍ`}
          />
          <Tile
            label="الجهات"
            value={String(t.entities)}
            hint={t.repeatEntities ? `${t.repeatEntities} كررت الخدمة` : "لا تكرار بعد"}
          />
          <Tile
            label="قيمة العقود (قبل الضريبة)"
            value={sar(t.contractNet)}
            hint={t.projects ? `المتوسط ${sar(t.avgContract)}` : undefined}
          />
          <Tile label="المستلم من العملاء" value={sar(t.received)} />
          <Tile
            label="الربح المتوقع"
            value={sar(t.profit)}
            tone={t.profit < 0 ? "bad" : undefined}
          />
          <Tile label="الربح المتحقق" value={sar(t.realizedProfit)} hint="بحسب ما استُلم" />
          <Tile
            label="الهامش الفعلي"
            value={t.projects ? pct(t.marginPct) : "—"}
            hint={
              s.plannedMarginPct !== null
                ? `المخطط ${pct(s.plannedMarginPct)}`
                : "لا هامش مخطط في التسعير"
            }
            tone={s.marginGap === null ? undefined : s.marginGap < 0 ? "bad" : "good"}
          />
          <Tile
            label="تحويل الطلبات"
            value={s.funnel.total ? pct(s.funnel.conversionPct) : "—"}
            hint={`${s.funnel.won} تعاقد من ${s.funnel.total} طلب`}
          />
        </div>
      </section>

      {t.projects > 0 && (
        <>
          <section>
            <h3 className="mb-3 font-bold">الباقات: أيها يُطلب وأيها يربح</h3>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-xs text-muted">
                  <tr>
                    <th className="p-3 text-start font-medium">الباقة</th>
                    <th className="p-3 text-start font-medium">المشاريع</th>
                    <th className="p-3 text-start font-medium">النسبة</th>
                    <th className="p-3 text-start font-medium">قيمة العقود</th>
                    <th className="p-3 text-start font-medium">الربح</th>
                    <th className="p-3 text-start font-medium">الهامش</th>
                  </tr>
                </thead>
                <tbody>
                  {s.packages.map((p) => (
                    <tr key={p.packageId || "none"} className="border-b last:border-0">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.projects}</td>
                      <td className="p-3">{pct(p.share)}</td>
                      <td className="p-3">{sar(p.contractNet)}</td>
                      <td className="p-3">{sar(p.profit)}</td>
                      <td className="p-3">{pct(p.marginPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-bold">الجهات التي نفذنا معها</h3>
              <Card className="divide-y p-0">
                {s.entities.map((e) => (
                  <Link
                    key={e.clientId}
                    to="/clients/$id"
                    params={{ id: e.clientId }}
                    className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-brand-soft/50"
                  >
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted">
                      {e.projects === 1 ? "مرة واحدة" : `${e.projects} مرات`} · {sar(e.contractNet)}
                    </span>
                  </Link>
                ))}
              </Card>
            </div>
            <div>
              <h3 className="mb-3 font-bold">حسب الربع (تاريخ بداية المشروع)</h3>
              <Card className="space-y-3 p-4">
                {s.trend.map((x) => (
                  <div key={x.key} className="text-sm">
                    <div className="mb-1 flex justify-between">
                      <span dir="ltr">{x.key === "—" ? "بلا تاريخ" : x.key}</span>
                      <span className="text-muted">
                        {x.projects} مشروع · {sar(x.contractNet)}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(x.contractNet / maxQ) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">مشاريع هذه الخدمة</h3>
              <Link
                to="/projects"
                search={{ product: product.id }}
                className="text-sm text-brand hover:underline"
              >
                فتحها في قائمة المشاريع
              </Link>
            </div>
            <ProjectsTable rows={projects} />
          </section>
        </>
      )}

      <LinkExisting product={product} />
    </div>
  );
}

function ProjectsTable({ rows }: { rows: StatProjectRow[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b text-xs text-muted">
          <tr>
            <th className="p-3 text-start font-medium">المشروع</th>
            <th className="p-3 text-start font-medium">الجهة</th>
            <th className="p-3 text-start font-medium">الباقة</th>
            <th className="p-3 text-start font-medium">الحالة</th>
            <th className="p-3 text-start font-medium">قيمة العقد</th>
            <th className="p-3 text-start font-medium">الربح</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-brand-soft/50">
              <td className="p-3">
                <Link
                  to="/projects/$id"
                  params={{ id: r.id }}
                  className="font-semibold hover:text-brand"
                >
                  {r.name}
                </Link>
                <div className="text-xs text-muted" dir="ltr">
                  {r.number}
                </div>
              </td>
              <td className="p-3">{r.clientName}</td>
              <td className="p-3">{r.packageName || "—"}</td>
              <td className="p-3">
                <Badge tone={STATUS_TONE[r.status] ?? "gray"}>
                  {label(PROJECT_STATUS_LABELS, r.status)}
                </Badge>
              </td>
              <td className="p-3">{sar(r.contractNet)}</td>
              <td className={`p-3 ${r.profit < 0 ? "text-red-600" : ""}`}>
                {sar(r.profit)}
                {!r.hasFinance && <span className="ms-1 text-xs text-muted">(تقدير)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Existing projects that belong to no service yet: the owner links them (nothing is guessed). */
function LinkExisting({ product }: { product: Product }) {
  const qc = useQueryClient();
  const un = useQuery(unlinkedQuery);
  const pkgs =
    useQuery(productQuery(product.id)).data?.content.packages ?? product.content.packages;
  const [pick, setPick] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [bulkPkg, setBulkPkg] = useState("");
  const [error, setError] = useState("");
  const link = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids)
        await ok(
          await sendJson(`/api/projects/${id}`, "PATCH", {
            productId: product.id,
            packageId: pick[id] ?? bulkPkg,
          }),
        );
    },
    onSuccess: async () => {
      setChosen(new Set());
      await qc.invalidateQueries({ queryKey: ["product-stats"] });
      await qc.invalidateQueries({ queryKey: ["product-unlinked"] });
      await qc.invalidateQueries({ queryKey: ["product-overview"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => setError("تعذّر ربط بعض المشاريع"),
  });
  const list = un.data ?? [];
  if (!list.length) return <p className="text-sm text-muted">كل المشاريع الحالية مرتبطة بخدمة.</p>;
  const toggle = (id: string) =>
    setChosen((c) => {
      const n = new Set(c);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <section>
      <h3 className="mb-1 font-bold">ربط المشاريع الحالية بهذه الخدمة</h3>
      <p className="mb-3 text-sm text-muted">
        {list.length} مشروع غير مرتبط بأي خدمة. اختر ما نفّذتموه ضمن «{product.name}» وحدّد الباقة
        (اختياري). لا يُربط شيء تلقائياً.
      </p>
      {error && <Notice>{error}</Notice>}
      <Card className="divide-y p-0">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <input
              type="checkbox"
              aria-label={`اختيار ${p.name}`}
              checked={chosen.has(p.id)}
              onChange={() => toggle(p.id)}
            />
            <span className="min-w-0 flex-1">
              <Link
                to="/projects/$id"
                params={{ id: p.id }}
                className="font-semibold hover:text-brand"
              >
                {p.name}
              </Link>
              <span className="block text-xs text-muted">{p.clientName}</span>
            </span>
            <Select
              aria-label={`باقة ${p.name}`}
              className="w-44"
              value={pick[p.id] ?? ""}
              onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))}
            >
              <option value="">بدون باقة محددة</option>
              {pkgs.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </Card>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={!chosen.size || link.isPending} onClick={() => link.mutate([...chosen])}>
          {link.isPending ? "جارٍ الربط…" : `ربط المحدد (${chosen.size})`}
        </Button>
        <Button variant="ghost" onClick={() => setChosen(new Set(list.map((p) => p.id)))}>
          تحديد الكل
        </Button>
      </div>
    </section>
  );
}
