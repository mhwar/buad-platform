import {
  daysInStage,
  followUpState,
  isStale,
  normalizeName,
  pipelineStats,
  STAGE_LABEL,
  winRate,
  wonThisQuarter,
} from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BarChart3, Columns3, FileText, List, Plus, Table2 } from "lucide-react";
import { type ComponentType, useState } from "react";
import { FilterBar } from "../../components/FilterBar";
import { StatTile } from "../../components/StatTile";
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  PageHeader,
  SearchBox,
  Segmented,
} from "../../components/ui";
import { day, sar } from "../../lib/format";
import { useCan } from "../../session";
import { type ProductRequest, type RequestStatus, requestsQuery } from "../products/products-api";
import { assigneesQuery } from "../tasks/queries";
import { LeadCard, STAGES } from "./LeadCard";
import { NewOpportunityDialog } from "./NewOpportunityDialog";
import { PipelineBoard } from "./PipelineBoard";
import { QuoteDialog } from "./QuoteDialog";
import { FollowUpDialog } from "./SalesPage";

type View = "board" | "list" | "table";
const VIEW_KEY = "buad-sales-view";
const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "list" || v === "table" ? v : "board";
  } catch {
    return "board";
  }
};
const STAGE_TONE: Record<RequestStatus, "blue" | "amber" | "green" | "gray" | "red"> = {
  new: "blue",
  contacted: "blue",
  quoted: "amber",
  negotiating: "amber",
  won: "green",
  lost: "gray",
};
const today = () => new Date().toISOString().slice(0, 10);
const isOpen = (r: ProductRequest) => r.status !== "won" && r.status !== "lost";
const needsFollowUp = (r: ProductRequest) =>
  isOpen(r) && ["overdue", "today"].includes(followUpState(r.followUpAt, today()));

/**
 * «الفرص»: the whole sales funnel on one page — a few numbers on top, then the opportunities as a
 * board, a list or a table, filtered by owner, source, service or what needs doing. Offers and the
 * analytics are one click away; each opportunity has its own page.
 */
export function OpportunitiesPage() {
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const all = useQuery(requestsQuery(""));
  const people = useQuery(assigneesQuery);
  const [view, setViewState] = useState<View>(readView);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState({ owner: "", source: "", service: "", state: "" });
  const [stage, setStage] = useState<RequestStatus>("new");
  const [adding, setAdding] = useState(false);
  const [following, setFollowing] = useState<ProductRequest | null>(null);
  const [quoting, setQuoting] = useState<ProductRequest | null>(null);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
    qc.invalidateQueries({ queryKey: ["sales-overview"] });
  };
  const owner = (id: string) => people.data?.find((p) => p.id === id)?.name ?? "";
  const reqs = (all.data?.requests ?? []).filter((r) => !r.interest);
  const nowS = Math.floor(Date.now() / 1000);
  const needle = normalizeName(q);
  const shown = reqs.filter(
    (r) =>
      (!needle ||
        normalizeName(`${r.name} ${r.entity} ${r.productName} ${r.phone}`).includes(needle)) &&
      (!filters.owner || (filters.owner === "none" ? !r.ownerId : r.ownerId === filters.owner)) &&
      (!filters.source || r.source === filters.source) &&
      (!filters.service || r.productName === filters.service) &&
      (filters.state === "follow"
        ? needsFollowUp(r)
        : filters.state === "stale"
          ? isStale(r, nowS)
          : filters.state === "open"
            ? isOpen(r)
            : filters.state === "closed"
              ? !isOpen(r)
              : true),
  );

  // The strip: what is open, what it is worth, how we are converting, and who to call today.
  const leads = reqs.map((r) => ({
    status: r.status,
    valueHalalas: Math.round(r.value * 100),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  const stats = pipelineStats(leads);
  const won = reqs.filter((r) => r.status === "won").length;
  const lost = reqs.filter((r) => r.status === "lost").length;
  const rate = winRate(won, lost);
  const due = reqs.filter(needsFollowUp).length;
  const services = [...new Set(reqs.map((r) => r.productName).filter(Boolean))];
  const card = (r: ProductRequest) => (
    <LeadCard
      r={r}
      ownerName={owner(r.ownerId)}
      edit={edit}
      onChanged={refresh}
      onFollow={() => setFollowing(r)}
      onQuote={() => setQuoting(r)}
    />
  );
  const VIEWS: { value: View; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { value: "board", label: "كانبان", icon: Columns3 },
    { value: "list", label: "قائمة", icon: List },
    { value: "table", label: "جدول", icon: Table2 },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="الفرص"
        subtitle="من أول تواصل حتى التعاقد: جديد ← مؤهَّل ← عرض سعر ← تفاوض ← مكسوب"
        actions={
          <>
            <Link
              to="/sales/quotes"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm hover:bg-brand-soft sm:min-h-9"
            >
              <FileText className="size-4" />
              عروض الأسعار
            </Link>
            <Link
              to="/sales/analytics"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm hover:bg-brand-soft sm:min-h-9"
            >
              <BarChart3 className="size-4" />
              التحليلات
            </Link>
            {edit && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                فرصة
              </Button>
            )}
          </>
        }
      />

      <ul
        aria-label="ملخص الفرص"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 dark:bg-slate-800 sm:grid-cols-5"
      >
        <Kpi label="مفتوحة" value={String(stats.open.count)} hint={sar(stats.open.value / 100)} />
        <Kpi label="القيمة المرجّحة" value={sar(stats.open.weighted / 100)} hint="بحسب المرحلة" />
        <Kpi label="مكسوب هذا الربع" value={sar(wonThisQuarter(leads, nowS) / 100)} tone="good" />
        <Kpi
          label="نسبة الكسب"
          value={rate === null ? "—" : `${rate}%`}
          hint={`${won} مكسوب · ${lost} خاسر`}
        />
        <li className="col-span-2 bg-surface sm:col-span-1">
          <button
            type="button"
            onClick={() =>
              setFilters((f) => ({ ...f, state: f.state === "follow" ? "" : "follow" }))
            }
            aria-pressed={filters.state === "follow"}
            className={cx(
              "block h-full w-full p-3 text-start transition hover:bg-brand-soft",
              filters.state === "follow" && "bg-brand-soft",
            )}
          >
            <span className="block text-xs text-muted">تحتاج متابعة اليوم</span>
            <span className={cx("mt-0.5 block text-lg font-bold", due > 0 && "text-amber-600")}>
              {due}
            </span>
            <span className="block text-[11px] text-muted">
              {filters.state === "follow" ? "اضغط لعرض الكل" : "اضغط للتصفية"}
            </span>
          </button>
        </li>
      </ul>

      <div className="flex flex-wrap items-start gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="ابحث باسم العميل أو الجهة أو الخدمة" />
        <Segmented<View>
          label="طريقة العرض"
          value={view}
          onChange={setView}
          items={VIEWS.map((v) => ({
            value: v.value,
            label: v.label,
            icon: <v.icon className="size-4" />,
          }))}
        />
      </div>
      <FilterBar
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        fields={[
          {
            key: "owner",
            label: "المسؤول",
            allLabel: "كل المسؤولين",
            value: filters.owner,
            options: [
              { value: "none", label: "بلا مسؤول" },
              ...(people.data ?? []).map((p) => ({ value: p.id, label: p.name || p.email })),
            ],
          },
          {
            key: "source",
            label: "المصدر",
            allLabel: "كل المصادر",
            value: filters.source,
            options: [
              { value: "site", label: "من الموقع" },
              { value: "manual", label: "سُجّلت يدوياً" },
            ],
          },
          {
            key: "service",
            label: "الخدمة",
            allLabel: "كل الخدمات",
            value: filters.service,
            options: services.map((s) => ({ value: s, label: s })),
          },
          {
            key: "state",
            label: "الحالة",
            allLabel: "كل الفرص",
            value: filters.state,
            options: [
              { value: "follow", label: "تحتاج متابعة" },
              { value: "stale", label: "راكدة (أسبوع بلا حركة)" },
              { value: "open", label: "المفتوحة فقط" },
              { value: "closed", label: "المغلقة فقط" },
            ],
          },
        ]}
      />

      {all.isPending && <Card className="h-48 animate-pulse" aria-busy />}
      {all.isSuccess && reqs.length === 0 && (
        <EmptyState
          title="لا فرص بعد"
          text="تصلك هنا طلبات «اطلب عرضاً» من الموقع، وتسجّل أي فرصة وصلتك بوسيلة أخرى."
          action={edit ? <Button onClick={() => setAdding(true)}>فرصة جديدة</Button> : undefined}
        />
      )}
      {reqs.length > 0 && shown.length === 0 && (
        <EmptyState title="لا فرص تطابق هذا البحث" text="غيّر التصفية أو امسح البحث." />
      )}

      {shown.length > 0 && view === "board" && (
        <>
          <div className="hidden lg:block">
            <PipelineBoard
              reqs={shown}
              ownerName={owner}
              edit={edit}
              onChanged={refresh}
              onFollow={setFollowing}
              onQuote={setQuoting}
            />
          </div>
          <div className="space-y-3 lg:hidden">
            <Segmented
              label="مراحل المسار"
              value={stage}
              onChange={setStage}
              items={STAGES.map((s) => ({
                value: s,
                label: `${STAGE_LABEL[s]} (${shown.filter((r) => r.status === s).length})`,
              }))}
            />
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown
                .filter((r) => r.status === stage)
                .map((r) => (
                  <li key={r.id}>{card(r)}</li>
                ))}
            </ul>
          </div>
        </>
      )}

      {shown.length > 0 && view === "list" && (
        <div className="space-y-5">
          {STAGES.map((s) => {
            const rows = shown.filter((r) => r.status === s);
            if (!rows.length) return null;
            return (
              <section key={s} aria-label={STAGE_LABEL[s]} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
                  {STAGE_LABEL[s]}
                  <span className="rounded-full bg-surface px-2 text-xs">{rows.length}</span>
                  <span className="text-xs font-normal">
                    {sar(rows.reduce((t, r) => t + r.value, 0))}
                  </span>
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((r) => (
                    <li key={r.id}>{card(r)}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {shown.length > 0 && view === "table" && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b bg-canvas/60 text-xs text-muted">
              <tr>
                {["الفرصة", "المرحلة", "القيمة", "المسؤول", "المتابعة", "في المرحلة", "المصدر"].map(
                  (h) => (
                    <th key={h} scope="col" className="px-3 py-2.5 text-start font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const fu = isOpen(r) ? followUpState(r.followUpAt, today()) : "none";
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-brand-soft/40">
                    <td className="px-3 py-2.5">
                      <Link
                        to="/sales/$id"
                        params={{ id: r.id }}
                        className="font-semibold hover:text-brand hover:underline"
                      >
                        {r.entity || r.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {r.productName || "خدمة غير محددة"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STAGE_TONE[r.status]}>{STAGE_LABEL[r.status]}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{r.value ? sar(r.value) : "—"}</td>
                    <td className="px-3 py-2.5">{owner(r.ownerId) || "—"}</td>
                    <td
                      className={cx(
                        "px-3 py-2.5",
                        fu === "overdue" && "font-semibold text-red-600",
                        fu === "today" && "font-semibold text-amber-600",
                      )}
                    >
                      {r.followUpAt && isOpen(r) ? day(r.followUpAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {isOpen(r) ? `${daysInStage(r, nowS)} يوم` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {r.source === "site" ? "الموقع" : "يدوي"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <NewOpportunityDialog open={adding} onClose={() => setAdding(false)} />
      {following && (
        <FollowUpDialog
          r={following}
          people={people.data ?? []}
          onClose={() => setFollowing(null)}
          onSaved={() => {
            setFollowing(null);
            refresh();
          }}
        />
      )}
      {quoting && (
        <QuoteDialog
          seed={{
            requestId: quoting.id,
            recipient: quoting.name,
            entity: quoting.entity,
            title: quoting.productName ? `عرض سعر — ${quoting.productName}` : "عرض سعر",
            value: quoting.value,
          }}
          onClose={() => setQuoting(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["quotes"] });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Kpi(r: { label: string; value: string; hint?: string; tone?: "good" }) {
  return <StatTile {...r} as="cell" />;
}
