import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Tabs,
} from "../../components/ui";
import { ago, ok } from "../../lib/format";
import { PortfolioOverview } from "./PortfolioOverview";
import {
  type BlueprintItem,
  blueprintsQuery,
  type ProductListItem,
  productsQuery,
  requestsQuery,
  STATUS_LABEL,
  sendJson,
} from "./products-api";
import { RequestsInbox } from "./RequestsInbox";

const STATUS_TONE = { draft: "gray", published: "green", archived: "amber" } as const;

/** «المنتجات والخدمات»: the offers we sell, and ready-made blueprints to start from. */
export function ProductsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: "products" | "overview" | "requests" };
  const tab = search.tab ?? "products";
  const newCount = useQuery(requestsQuery("")).data?.counts.new ?? 0;
  const products = useQuery(productsQuery);
  const blueprints = useQuery(blueprintsQuery);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: productsQuery.queryKey });
    qc.invalidateQueries({ queryKey: blueprintsQuery.queryKey });
  };
  const fromBlueprint = useMutation({
    mutationFn: async (key: string) =>
      ok<{ id: string }>(await sendJson(`/api/products/from-blueprint/${key}`, "POST")),
    onSuccess: (r) => {
      refresh();
      navigate({ to: "/products/$id", params: { id: r.id } });
    },
    onError: () => setError("تعذّر إنشاء المنتج"),
  });
  const seedAll = useMutation({
    mutationFn: async () =>
      ok<{ created: string[] }>(await sendJson("/api/products/seed-blueprints", "POST")),
    onSuccess: refresh,
    onError: () => setError("تعذّر إنشاء المسودات"),
  });
  const create = useMutation({
    mutationFn: async () => ok<{ id: string }>(await sendJson("/api/products", "POST", { name })),
    onSuccess: (r) => {
      refresh();
      navigate({ to: "/products/$id", params: { id: r.id } });
    },
    onError: () => setError("تعذّر إنشاء المنتج"),
  });

  const list = products.data ?? [];
  const available = (blueprints.data ?? []).filter((b) => !b.productId);

  return (
    <div>
      <PageHeader
        title="المنتجات والخدمات"
        subtitle="ابنِ منتجات مميزة للجمعيات: باقات وتكلفة وتسعير وتشغيل، ثم انشرها في الموقع."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> منتج جديد
          </Button>
        }
      />
      <Tabs
        items={[
          {
            to: "",
            label: "المنتجات",
            active: tab === "products",
            onClick: () =>
              navigate({ to: "/products", search: { tab: "products" }, replace: true }),
          },
          {
            to: "",
            label: "نظرة عامة",
            active: tab === "overview",
            onClick: () =>
              navigate({ to: "/products", search: { tab: "overview" }, replace: true }),
          },
          {
            to: "",
            label: newCount ? `الطلبات (${newCount} جديد)` : "الطلبات",
            active: tab === "requests",
            onClick: () =>
              navigate({ to: "/products", search: { tab: "requests" }, replace: true }),
          },
        ]}
      />
      {error && <Notice>{error}</Notice>}
      {tab === "requests" ? (
        <RequestsInbox products={list} />
      ) : tab === "overview" ? (
        <PortfolioOverview />
      ) : (
        <>
          {products.isError && <Notice>تعذّر تحميل المنتجات</Notice>}

          {products.isPending ? (
            <div className="h-40 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ) : list.length === 0 ? (
            <EmptyState
              title="لا توجد منتجات بعد"
              text="ابدأ من أحد القوالب الجاهزة أدناه، أو أنشئ منتجاً فارغاً."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}

          {available.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
                <Sparkles className="size-5 text-brand" /> قوالب جاهزة
              </h2>
              <p className="mb-4 text-sm text-muted">
                كل قالب يحمل المحتوى والباقات والاستبيان ومراحل التشغيل. التكاليف تبدأ فارغة: أدخل
                تكاليفك الفعلية ليُحسب السعر.
              </p>
              <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
                <p className="text-sm">
                  <b>{available.length} قوالب جاهزة لم تُنشأ بعد.</b> تُنشأ كمسودات لا تظهر في الموقع
                  حتى تراجعها وتنشرها.
                </p>
                <Button disabled={seedAll.isPending} onClick={() => seedAll.mutate()}>
                  {seedAll.isPending ? "جارٍ الإنشاء…" : "إنشاء الكل كمسودات"}
                </Button>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                {available.map((b) => (
                  <BlueprintCard
                    key={b.key}
                    b={b}
                    busy={fromBlueprint.isPending && fromBlueprint.variables === b.key}
                    onStart={() => fromBlueprint.mutate(b.key)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating} title="منتج جديد">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="space-y-4"
        >
          <Field label="اسم المنتج">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!name.trim() || create.isPending} className="w-full">
            إنشاء
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

function ProductCard({ p }: { p: ProductListItem }) {
  return (
    <Link to="/products/$id" params={{ id: p.id }} className="block">
      <Card className="h-full p-5 transition hover:border-brand">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold">{p.name}</h3>
          <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        </div>
        {p.tagline && <p className="mt-1 text-sm text-muted">{p.tagline}</p>}
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            {p.packages} باقات · جاهزية {p.readyCount}/{p.readyTotal}
          </span>
          <span>{ago(p.updatedAt)}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
          aria-hidden="true"
        >
          <div
            className="h-full bg-brand"
            style={{ width: `${(p.readyCount / Math.max(1, p.readyTotal)) * 100}%` }}
          />
        </div>
        {p.status === "published" && p.showOnSite && (
          <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">ظاهر في الموقع</p>
        )}
      </Card>
    </Link>
  );
}

function BlueprintCard({
  b,
  busy,
  onStart,
}: {
  b: BlueprintItem;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 border-dashed p-5">
      <div>
        <h3 className="font-bold">{b.name}</h3>
        <p className="mt-1 text-sm text-muted">{b.tagline}</p>
      </div>
      <Button variant="secondary" disabled={busy} onClick={onStart} className="self-start">
        {busy ? "جارٍ الإنشاء…" : "ابدأ من هذا القالب"}
      </Button>
    </Card>
  );
}
