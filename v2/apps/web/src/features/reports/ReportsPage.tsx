import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import { useState } from "react";
import { matches } from "../../components/shell/CommandPalette";
import { Badge, Card, cx, EmptyState, PageHeader, SearchBox } from "../../components/ui";
import { meQuery } from "../../session";
import { type PeriodChoice, resolvePeriod } from "../finance-overview/api";
import { PeriodPicker } from "../finance-overview/PeriodPicker";
import {
  CATEGORY_LABEL,
  type Period,
  type ReportCategory,
  type ReportDef,
  visibleReports,
} from "./registry";

const route = getRouteApi("/reports");
const FAV_KEY = "buad-report-favs";
const readFavs = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const FORMAT_LABEL = { view: "عرض", pdf: "PDF", excel: "Excel" } as const;

/** The period chosen here, as the dates and year/quarter the reports understand. */
export function periodOf(c: PeriodChoice): Period | null {
  const r = resolvePeriod(c);
  if (!r.period.from || !r.period.to) return null;
  const year = Number(r.period.from.slice(0, 4));
  const q = Math.floor((Number(r.period.from.slice(5, 7)) - 1) / 3) + 1;
  return { from: r.period.from, to: r.period.to, year, q, label: r.label };
}

/**
 * «التقارير»: every report the platform has, in one place, by subject — with one period that
 * travels into the report you open, and favourites for the ones you use most.
 */
export function ReportsPage() {
  const s = route.useSearch();
  const nav = route.useNavigate();
  const me = useQuery(meQuery).data;
  const [q, setQ] = useState("");
  const [favs, setFavsState] = useState<string[]>(readFavs);
  const setFavs = (v: string[]) => {
    setFavsState(v);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(v));
    } catch {
      // storage blocked: favourites last for this visit
    }
  };
  const choice: PeriodChoice = {
    preset: s.preset ?? "year",
    year: s.year,
    q: s.q,
    from: s.from,
    to: s.to,
  };
  const period = periodOf(choice);
  const all = visibleReports(me?.perms ?? []);
  const shown = all.filter((r) => !q || matches(`${r.title} ${r.question}`, q));
  const favourites = shown.filter((r) => favs.includes(r.key));
  const groups = (Object.keys(CATEGORY_LABEL) as ReportCategory[])
    .map((c) => ({ c, items: shown.filter((r) => r.category === c) }))
    .filter((g) => g.items.length);
  const toggle = (k: string) =>
    setFavs(favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k]);

  return (
    <>
      <PageHeader
        title="التقارير"
        subtitle="كل تقارير المنصة في مكان واحد. اختر الفترة مرة، وتنتقل مع التقرير الذي تفتحه."
      />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-semibold">الفترة</span>
        <PeriodPicker value={choice} onChange={(v) => nav({ search: { ...v }, replace: true })} />
        {period && <Badge tone="blue">{period.label}</Badge>}
      </Card>
      <div className="mb-5">
        <SearchBox value={q} onChange={setQ} placeholder="ابحث عن تقرير بالاسم أو بما يجيب عنه" />
      </div>
      {all.length === 0 && <EmptyState title="لا تقارير متاحة لدورك" />}
      {all.length > 0 && shown.length === 0 && <EmptyState title="لا تقرير بهذا الاسم" />}
      {favourites.length > 0 && (
        <Group title="المفضلة" items={favourites} period={period} favs={favs} onFav={toggle} />
      )}
      {groups.map((g) => (
        <Group
          key={g.c}
          title={CATEGORY_LABEL[g.c]}
          items={g.items}
          period={period}
          favs={favs}
          onFav={toggle}
        />
      ))}
    </>
  );
}

function Group({
  title,
  items,
  period,
  favs,
  onFav,
}: {
  title: string;
  items: ReportDef[];
  period: Period | null;
  favs: string[];
  onFav: (k: string) => void;
}) {
  return (
    <section aria-label={title} className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((r) => {
          const fav = favs.includes(r.key);
          return (
            <li key={r.key}>
              <Card className="relative flex h-full flex-col gap-2 p-4 transition hover:border-brand">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <r.icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={r.href(r.periodic ? period : null) as never}
                      className="font-semibold after:absolute after:inset-0 after:rounded-2xl hover:text-brand"
                    >
                      {r.title}
                    </Link>
                    <p className="text-sm text-muted">{r.question}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={fav}
                    aria-label={
                      fav ? `إزالة ${r.title} من المفضلة` : `إضافة ${r.title} إلى المفضلة`
                    }
                    onClick={() => onFav(r.key)}
                    className={cx(
                      "relative z-10 grid size-9 place-items-center rounded-lg hover:bg-brand-soft",
                      fav ? "text-amber-500" : "text-muted",
                    )}
                  >
                    <Star className={cx("size-4", fav && "fill-current")} />
                  </button>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  {r.formats.map((f) => (
                    <span key={f} className="rounded-full border px-2 py-0.5 text-muted">
                      {FORMAT_LABEL[f]}
                    </span>
                  ))}
                  {r.periodic && period && <Badge tone="blue">{period.label}</Badge>}
                  {r.perRecord ? (
                    <span className="text-muted">{r.perRecord}</span>
                  ) : (
                    <ArrowLeft className="ms-auto size-4 text-muted" />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
