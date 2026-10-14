import type { PricingModel, ProductContent } from "@buad/schema/products";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from "../../components/ui";
import { ApiError, ok } from "../../lib/format";
import { IconSelect, LinesField, Repeater, TitleTextList, uid } from "./editors";
import { PerformancePanel } from "./PerformancePanel";
import { PricingPanel } from "./PricingPanel";
import { type Product, productQuery, STATUS_LABEL, sendJson } from "./products-api";

const route = getRouteApi("/products/$id");
const STEPS = [
  { key: "identity", label: "التعريف" },
  { key: "packages", label: "الباقات" },
  { key: "pricing", label: "التكلفة والتسعير" },
  { key: "performance", label: "الأداء" },
  { key: "intake", label: "الاستبيان" },
  { key: "content", label: "التشغيل والمحتوى" },
  { key: "publish", label: "النشر" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

type Draft = {
  name: string;
  slug: string;
  tagline: string;
  status: Product["status"];
  showOnSite: boolean;
  content: ProductContent;
  pricing: PricingModel;
};
const draftOf = (p: Product): Draft => ({
  name: p.name,
  slug: p.slug,
  tagline: p.tagline,
  status: p.status,
  showOnSite: p.showOnSite,
  content: p.content,
  pricing: p.pricing,
});

const blank = (s: string) => s.trim() === "";
/** What is stored: no blank lines, no pricing rows for packages that no longer exist. */
function cleaned(d: Draft): Draft {
  const keep = (xs: string[]) => xs.map((x) => x.trim()).filter((x) => x);
  const c = d.content;
  const ids = new Set(c.packages.map((p) => p.id));
  return {
    ...d,
    content: {
      ...c,
      hero: { ...c.hero, tags: keep(c.hero.tags) },
      offerings: c.offerings.map((o) => ({ ...o, points: keep(o.points) })),
      packages: c.packages.map((p) => ({ ...p, features: keep(p.features) })),
      roles: { client: keep(c.roles.client), us: keep(c.roles.us) },
      proof: c.proof.map((p) => ({ ...p, scope: keep(p.scope) })),
      intake: c.intake
        .filter((q) => !blank(q.label))
        .map((q) => ({ ...q, options: keep(q.options) })),
      faq: c.faq.filter((f) => !blank(f.q)),
    },
    pricing: {
      ...d.pricing,
      lines: d.pricing.lines.filter((l) => !blank(l.label)),
      packages: d.pricing.packages.filter((p) => ids.has(p.packageId)),
    },
  };
}

export function ProductBuilderPage() {
  const { id } = route.useParams();
  const q = useQuery(productQuery(id));
  if (q.isPending)
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!q.data)
    return (
      <EmptyState
        title="المنتج غير موجود"
        action={
          <Link to="/products" className="text-brand hover:underline">
            العودة إلى المنتجات
          </Link>
        }
      />
    );
  // Re-mounts on every saved version, so the form always starts from what is stored.
  return <Builder key={q.data.version} product={q.data} />;
}

function Builder({ product }: { product: Product }) {
  const qc = useQueryClient();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const step: StepKey = search.step ?? "identity";
  const [d, setD] = useState<Draft>(() => draftOf(product));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "amber" | "blue"; text: string } | null>(null);
  const dirty = JSON.stringify(cleaned(d)) !== JSON.stringify(cleaned(draftOf(product)));

  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const patchContent = (p: Partial<ProductContent>) =>
    setD((x) => ({ ...x, content: { ...x.content, ...p } }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const c = cleaned(d);
    try {
      await ok(
        await sendJson(`/api/products/${product.id}`, "PATCH", { version: product.version, ...c }),
      );
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["product-blueprints"] });
      await qc.invalidateQueries({ queryKey: productQuery(product.id).queryKey });
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setMsg(
        code === "stale"
          ? { tone: "amber", text: "عدّل مستخدم آخر هذا المنتج للتو. حدّث الصفحة ثم أعد تعديلك." }
          : code === "duplicate_slug"
            ? { tone: "red", text: "رابط المنتج مستخدم في منتج آخر" }
            : { tone: "red", text: "تعذّر الحفظ، راجع الحقول وأعد المحاولة" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {d.name || "منتج"} <Badge>{STATUS_LABEL[d.status]}</Badge>
          </span>
        }
        subtitle={
          <Link to="/products" className="hover:text-ink">
            ← المنتجات والخدمات
          </Link>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Tabs
        items={STEPS.map((s) => ({
          to: "",
          label: s.label,
          active: step === s.key,
          onClick: () => navigate({ search: { step: s.key }, replace: true }),
        }))}
      />

      {step === "identity" && <Identity d={d} patch={patch} patchContent={patchContent} />}
      {step === "packages" && <Packages d={d} patchContent={patchContent} />}
      {step === "pricing" && (
        <PricingPanel
          pricing={d.pricing}
          packages={d.content.packages}
          vatRate={product.vatRate}
          onChange={(pricing) => patch({ pricing })}
        />
      )}
      {step === "performance" && <PerformancePanel product={product} />}
      {step === "intake" && <Intake d={d} patchContent={patchContent} />}
      {step === "content" && <ContentSections d={d} patchContent={patchContent} />}
      {step === "publish" && (
        <Publish product={product} d={d} patch={patch} patchContent={patchContent} dirty={dirty} />
      )}

      {step !== "performance" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="text-sm text-muted">
              {dirty ? "تغييرات غير محفوظة" : "كل التغييرات محفوظة"}
            </span>
            <Button onClick={save} disabled={!dirty || busy || blank(d.name)}>
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const Section = ({
  title,
  children,
  open,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) => (
  <details open={open} className="rounded-2xl border bg-surface">
    <summary className="cursor-pointer px-5 py-3 font-semibold">{title}</summary>
    <div className="border-t p-5">{children}</div>
  </details>
);

function Identity({
  d,
  patch,
  patchContent,
}: {
  d: Draft;
  patch: (p: Partial<Draft>) => void;
  patchContent: (p: Partial<ProductContent>) => void;
}) {
  const h = d.content.hero;
  const setHero = (p: Partial<typeof h>) => patchContent({ hero: { ...h, ...p } });
  return (
    <Card className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="اسم المنتج">
        <Input value={d.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <Field label="رابط المنتج في الموقع" hint="أحرف إنجليزية صغيرة وأرقام وشرطات">
        <Input dir="ltr" value={d.slug} onChange={(e) => patch({ slug: e.target.value })} />
      </Field>
      <Field label="وصف مختصر" className="sm:col-span-2">
        <Input value={d.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
      </Field>
      <Field label="تصنيف يظهر فوق العنوان">
        <Input value={h.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} />
      </Field>
      <Field label="العنوان الرئيسي">
        <Input value={h.title} onChange={(e) => setHero({ title: e.target.value })} />
      </Field>
      <Field label="الوصف التفصيلي" className="sm:col-span-2">
        <Textarea
          rows={3}
          value={h.subtitle}
          onChange={(e) => setHero({ subtitle: e.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={d.content.comingSoon}
          onChange={(e) => patchContent({ comingSoon: e.target.checked })}
        />
        قريباً: تعريف بالخدمة وتسجيل اهتمام فقط (دون باقات أو أسعار)
      </label>
      <LinesField
        label="وسوم قصيرة"
        value={h.tags}
        onChange={(tags) => setHero({ tags })}
        rows={3}
        hint="حتى 6، سطر لكل وسم"
      />
    </Card>
  );
}

function Packages({
  d,
  patchContent,
}: {
  d: Draft;
  patchContent: (p: Partial<ProductContent>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        الباقات هي ما يختاره العميل. بعد تحديدها حدّد تكلفتها وسعرها في «التكلفة والتسعير».
      </p>
      <Repeater
        items={d.content.packages}
        max={6}
        addLabel="إضافة باقة"
        onChange={(packages) => patchContent({ packages })}
        make={() => ({ id: uid("pkg"), name: "", audience: "", features: [], highlight: false })}
        render={(p, set) => (
          <>
            <Field label="اسم الباقة">
              <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.highlight}
                onChange={(e) => set({ highlight: e.target.checked })}
              />
              إبرازها كالأكثر شمولاً
            </label>
            <Field label="لمن تناسب؟" className="sm:col-span-2">
              <Input value={p.audience} onChange={(e) => set({ audience: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <LinesField
                label="مزاياها"
                value={p.features}
                onChange={(features) => set({ features })}
                rows={4}
              />
            </div>
          </>
        )}
      />
    </div>
  );
}

function Intake({
  d,
  patchContent,
}: {
  d: Draft;
  patchContent: (p: Partial<ProductContent>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        أسئلة تظهر في نموذج «اطلب عرضاً» بالموقع، وتصلك الإجابات في صندوق الطلبات. اسألهم فقط عمّا
        يكفي لإعداد عرض مخصص.
      </p>
      <Repeater
        items={d.content.intake}
        max={12}
        addLabel="إضافة سؤال"
        onChange={(intake) => patchContent({ intake })}
        make={() => ({
          key: `q_${Math.random().toString(36).slice(2, 7)}`,
          label: "",
          type: "text" as const,
          options: [],
          required: false,
        })}
        render={(it, set) => (
          <>
            <Field label="السؤال" className="sm:col-span-2">
              <Input value={it.label} onChange={(e) => set({ label: e.target.value })} />
            </Field>
            <Field label="نوع الإجابة">
              <Select
                value={it.type}
                onChange={(e) => set({ type: e.target.value as typeof it.type })}
              >
                <option value="text">نص</option>
                <option value="number">رقم</option>
                <option value="select">اختيار واحد</option>
                <option value="multi">اختيار متعدد</option>
              </Select>
            </Field>
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={it.required}
                onChange={(e) => set({ required: e.target.checked })}
              />
              إلزامي
            </label>
            {(it.type === "select" || it.type === "multi") && (
              <div className="sm:col-span-2">
                <LinesField
                  label="الخيارات"
                  value={it.options}
                  onChange={(options) => set({ options })}
                  rows={3}
                />
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}

function ContentSections({
  d,
  patchContent,
}: {
  d: Draft;
  patchContent: (p: Partial<ProductContent>) => void;
}) {
  const c = d.content;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        كل قسم اختياري: ما تتركه فارغاً لا يظهر في صفحة المنتج. افتح القسم الذي تريد تعديله.
      </p>
      <Section title={`المشكلة التي نحلها (${c.problems.length})`}>
        <TitleTextList
          items={c.problems}
          onChange={(problems) => patchContent({ problems })}
          addLabel="إضافة"
        />
      </Section>
      <Section title={`ما نقدمه: المسارات (${c.offerings.length})`}>
        <Repeater
          items={c.offerings}
          max={6}
          addLabel="إضافة مساراً"
          onChange={(offerings) => patchContent({ offerings })}
          make={() => ({ title: "", points: [] }) as ProductContent["offerings"][number]}
          render={(o, set) => (
            <>
              <Field label="اسم المسار">
                <Input value={o.title} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <IconSelect value={o.icon} onChange={(icon) => set({ icon })} />
              <div className="sm:col-span-2">
                <LinesField
                  label="النقاط"
                  value={o.points}
                  onChange={(points) => set({ points })}
                />
              </div>
            </>
          )}
        />
      </Section>
      <Section title={`نموذج التشغيل (${c.model.length})`}>
        <TitleTextList
          items={c.model}
          onChange={(model) => patchContent({ model })}
          addLabel="إضافة"
        />
      </Section>
      <Section title={`المزايا وكفاءة التكلفة (${c.benefits.length})`}>
        <TitleTextList
          items={c.benefits}
          onChange={(benefits) => patchContent({ benefits })}
          addLabel="إضافة"
        />
      </Section>
      <Section title={`مقارنة: التشغيل الذاتي مقابل معنا (${c.comparison.length})`}>
        <Repeater
          items={c.comparison}
          max={10}
          addLabel="إضافة صفاً"
          onChange={(comparison) => patchContent({ comparison })}
          make={() => ({ label: "", self: "", us: "" })}
          render={(r, set) => (
            <>
              <Field label="المعيار" className="sm:col-span-2">
                <Input value={r.label} onChange={(e) => set({ label: e.target.value })} />
              </Field>
              <Field label="التشغيل الذاتي">
                <Input value={r.self} onChange={(e) => set({ self: e.target.value })} />
              </Field>
              <Field label="معنا">
                <Input value={r.us} onChange={(e) => set({ us: e.target.value })} />
              </Field>
            </>
          )}
        />
      </Section>
      <Section title={`مراحل التشغيل (${c.process.length})`}>
        <TitleTextList
          items={c.process}
          onChange={(process) => patchContent({ process })}
          addLabel="إضافة مرحلة"
          icons={false}
        />
      </Section>
      <Section title="توزيع الأدوار">
        <div className="grid gap-4 sm:grid-cols-2">
          <LinesField
            label="دور الجهة"
            value={c.roles.client}
            onChange={(client) => patchContent({ roles: { ...c.roles, client } })}
          />
          <LinesField
            label="دورنا"
            value={c.roles.us}
            onChange={(us) => patchContent({ roles: { ...c.roles, us } })}
          />
        </div>
      </Section>
      <Section title={`معايير الخدمة (${c.standards.length})`}>
        <TitleTextList
          items={c.standards}
          onChange={(standards) => patchContent({ standards })}
          addLabel="إضافة"
        />
      </Section>
      <Section title={`ما تستلمه الجهة (${c.deliverables.length})`}>
        <TitleTextList
          items={c.deliverables}
          onChange={(deliverables) => patchContent({ deliverables })}
          addLabel="إضافة"
        />
      </Section>
      <Section title={`تجارب منفذة (${c.proof.length})`}>
        <Repeater
          items={c.proof}
          max={6}
          addLabel="إضافة تجربة"
          onChange={(proof) => patchContent({ proof })}
          make={() => ({
            title: "",
            entity: "",
            beneficiaries: "",
            text: "",
            scope: [] as string[],
          })}
          render={(p, set) => (
            <>
              <Field label="اسم المشروع">
                <Input value={p.title} onChange={(e) => set({ title: e.target.value })} />
              </Field>
              <Field label="الجهة">
                <Input value={p.entity} onChange={(e) => set({ entity: e.target.value })} />
              </Field>
              <Field label="المستفيدون">
                <Input
                  value={p.beneficiaries}
                  onChange={(e) => set({ beneficiaries: e.target.value })}
                />
              </Field>
              <Field label="الوصف" className="sm:col-span-2">
                <Textarea rows={2} value={p.text} onChange={(e) => set({ text: e.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <LinesField
                  label="نطاق التنفيذ"
                  value={p.scope}
                  onChange={(scope) => set({ scope })}
                  rows={3}
                />
              </div>
            </>
          )}
        />
      </Section>
      <Section title={`أسئلة شائعة (${c.faq.length})`}>
        <Repeater
          items={c.faq}
          max={12}
          addLabel="إضافة سؤال"
          onChange={(faq) => patchContent({ faq })}
          make={() => ({ q: "", a: "" })}
          render={(f, set) => (
            <>
              <Field label="السؤال" className="sm:col-span-2">
                <Input value={f.q} onChange={(e) => set({ q: e.target.value })} />
              </Field>
              <Field label="الإجابة" className="sm:col-span-2">
                <Textarea rows={3} value={f.a} onChange={(e) => set({ a: e.target.value })} />
              </Field>
            </>
          )}
        />
      </Section>
    </div>
  );
}

function Publish({
  product,
  d,
  patch,
  patchContent,
  dirty,
}: {
  product: Product;
  d: Draft;
  patch: (p: Partial<Draft>) => void;
  patchContent: (p: Partial<ProductContent>) => void;
  dirty: boolean;
}) {
  const missing = product.readiness.filter((r) => !r.ok);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-bold">الجاهزية للنشر</h3>
        <ul className="space-y-2 text-sm">
          {product.readiness.map((r) => (
            <li key={r.key} className="flex items-start gap-2">
              {r.ok ? (
                <Check className="mt-0.5 size-4 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 size-4 text-amber-600" />
              )}
              <span>
                {r.label}
                {!r.ok && <span className="block text-xs text-muted">{r.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        {dirty && <p className="mt-3 text-xs text-muted">احفظ تغييراتك ليُحدَّث هذا التقييم.</p>}
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="font-bold">الحالة والظهور</h3>
        <Field label="الحالة">
          <Select
            value={d.status}
            onChange={(e) => patch({ status: e.target.value as Draft["status"] })}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.showOnSite}
            onChange={(e) => patch({ showOnSite: e.target.checked })}
          />
          يظهر في الموقع التعريفي (عند نشره)
        </label>
        {d.showOnSite && d.status !== "published" && (
          <Notice tone="amber">لن يظهر في الموقع قبل أن تكون حالته «منشور».</Notice>
        )}
        {d.status === "published" && missing.length > 0 && (
          <Notice tone="amber">
            ما زال ينقصه: {missing.map((m) => m.label).join("، ")}. يمكنك نشره، لكن الأفضل إكماله.
          </Notice>
        )}
        <p className="text-xs text-muted">
          التكاليف والهوامش لا تظهر أبداً للعامة، وصفحة المنتج تعرض المحتوى فقط.
        </p>
      </Card>
      <Card className="space-y-3 p-5 lg:col-span-2">
        <h3 className="font-bold">الملف التعريفي بالخدمة (PDF)</h3>
        <p className="text-sm text-muted">
          يُبنى تلقائياً من محتوى المنتج على شرائح 16:9 بهوية الموقع، ولا يحمل أي تكلفة أو سعر.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/print/products/$id"
            params={{ id: product.id }}
            target="_blank"
            className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-brand-soft"
          >
            معاينة وتنزيل الملف
          </Link>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.content.brochure}
              onChange={(e) => patchContent({ brochure: e.target.checked })}
            />
            إتاحته للتنزيل من صفحة الخدمة في الموقع
          </label>
        </div>
        {dirty && <p className="text-xs text-muted">احفظ تغييراتك ليعكسها الملف.</p>}
      </Card>
    </div>
  );
}
