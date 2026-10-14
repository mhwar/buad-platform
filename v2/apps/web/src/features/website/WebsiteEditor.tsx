import { type SiteContent, trustItems } from "@buad/schema/site";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, ExternalLink } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Textarea,
} from "../../components/ui";
import { ApiError, ago, ok } from "../../lib/format";
import { uploadImage } from "../org/OrgSettings";
import { IconSelect, LinesField, Repeater, TitleTextList } from "../products/editors";
import { productsQuery, sendJson } from "../products/products-api";
import { TrustLogosEditor } from "./TrustLogosEditor";

type Draft = {
  content: SiteContent;
  version: number;
  isPublished: boolean;
  publishedAt: number;
  changed: boolean;
};
const draftQuery = {
  queryKey: ["site-draft"],
  queryFn: async () => ok<Draft & { ok: true }>(await fetch("/api/site/draft")),
};

const ACCENT_LABEL: Record<string, string> = {
  "#5B3FE0": "بنفسجي",
  "#0B1550": "كحلي",
  "#F04E23": "برتقالي",
};
const SHOW_LABEL: Record<keyof SiteContent["show"], string> = {
  trust: "جهات نفذنا معها",
  why: "لماذا نحن",
  services: "الخدمات",
  products: "المنتجات المنشورة",
  method: "كيف نعمل",
  works: "أعمالنا",
  faq: "الأسئلة الشائعة",
};

/** «الموقع»: edit the public website's content as a draft, preview it, publish it. */
export function WebsiteEditorPage() {
  const q = useQuery(draftQuery);
  if (q.isPending)
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!q.data) return <Notice>تعذّر تحميل الموقع</Notice>;
  return <Editor key={q.data.version} data={q.data} />;
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
    <div className="space-y-4 border-t p-5">{children}</div>
  </details>
);

function Editor({ data }: { data: Draft }) {
  const qc = useQueryClient();
  const products = useQuery(productsQuery);
  const [c, setC] = useState<SiteContent>(data.content);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "logo">("");
  const [msg, setMsg] = useState<{ tone: "red" | "amber" | "blue"; text: string } | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(data.content);
  const patch = <K extends keyof SiteContent>(k: K, v: Partial<SiteContent[K]>) =>
    setC((x) => ({ ...x, [k]: { ...(x[k] as object), ...v } }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["site-draft"] });
  const clean = (x: SiteContent): SiteContent => ({
    ...x,
    trust: { ...x.trust, names: x.trust.names.map((n) => n.trim()).filter(Boolean) },
    why: {
      ...x.why,
      without: {
        ...x.why.without,
        items: x.why.without.items.map((n) => n.trim()).filter(Boolean),
      },
      with: { ...x.why.with, items: x.why.with.items.map((n) => n.trim()).filter(Boolean) },
    },
    faq: { ...x.faq, items: x.faq.items.filter((f) => f.q.trim()) },
  });

  const run = async (kind: typeof busy, fn: () => Promise<unknown>, done?: string) => {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg({ tone: "blue", text: done });
      await refresh();
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setMsg(
        code === "stale"
          ? { tone: "amber", text: "عدّل مستخدم آخر الموقع للتو. حدّث الصفحة ثم أعد تعديلك." }
          : { tone: "red", text: "تعذّرت العملية، راجع الحقول وأعد المحاولة" },
      );
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", async () =>
      ok(await sendJson("/api/site/draft", "PATCH", { version: data.version, content: clean(c) })),
    );
  const pickLogo = (file?: File) =>
    file &&
    run("logo", async () => {
      const a = await uploadImage(file);
      const next = { ...c, brand: { ...c.brand, logoAsset: a.id } };
      setC(next);
      await ok(
        await sendJson("/api/site/draft", "PATCH", { version: data.version, content: clean(next) }),
      );
    });
  const publicUrl = `${window.location.origin}/site`;

  return (
    <div className="pb-24">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            الموقع{" "}
            {data.isPublished ? (
              <Badge tone={data.changed ? "amber" : "green"}>
                {data.changed ? "منشور، وفيه تعديلات غير منشورة" : "منشور"}
              </Badge>
            ) : (
              <Badge>غير منشور</Badge>
            )}
          </span>
        }
        subtitle={
          data.isPublished
            ? `آخر نشر ${ago(data.publishedAt)}`
            : "حرّر المحتوى ثم انشره ليراه الزوار. قبل النشر لا يظهر شيء للعامة."
        }
        actions={
          <>
            <a href="/site?preview=1" target="_blank" rel="noreferrer">
              <Button variant="secondary" disabled={dirty}>
                <ExternalLink className="size-4" /> معاينة المسودة
              </Button>
            </a>
            <Button
              disabled={dirty || busy !== "" || (data.isPublished && !data.changed)}
              onClick={() =>
                run(
                  "publish",
                  async () => ok(await sendJson("/api/site/publish", "POST")),
                  "تم نشر الموقع",
                )
              }
            >
              {busy === "publish" ? "جارٍ النشر…" : "نشر"}
            </Button>
          </>
        }
      />
      {dirty && <Notice tone="amber">احفظ تغييراتك أولاً لتتمكن من المعاينة أو النشر.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {data.isPublished && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            رابط الموقع:{" "}
            <span dir="ltr" className="font-mono">
              {publicUrl}
            </span>
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(publicUrl)}>
              <Copy className="size-4" /> نسخ
            </Button>
            <Button
              variant="ghost"
              disabled={busy !== ""}
              onClick={() =>
                run(
                  "unpublish",
                  async () => ok(await sendJson("/api/site/unpublish", "POST")),
                  "أُوقف النشر",
                )
              }
            >
              إيقاف النشر
            </Button>
          </span>
        </Card>
      )}

      <div className="space-y-3">
        <Section title="الهوية والتواصل" open>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الجهة في الموقع">
              <Input
                value={c.brand.name}
                onChange={(e) => patch("brand", { name: e.target.value })}
              />
            </Field>
            <Field label="عبارة تحت الشعار">
              <Input
                value={c.brand.tagline}
                onChange={(e) => patch("brand", { tagline: e.target.value })}
              />
            </Field>
            <Field label="اللون الأساسي">
              <Select
                value={c.brand.accent}
                onChange={(e) =>
                  patch("brand", { accent: e.target.value as SiteContent["brand"]["accent"] })
                }
              >
                {Object.entries(ACCENT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="text-sm">
              <p className="mb-1 font-medium">الشعار</p>
              <div className="flex items-center gap-3">
                <img
                  src={c.brand.logoAsset ? `/api/assets/${c.brand.logoAsset}` : "/site/logo.png"}
                  alt="الشعار الحالي"
                  className="h-12 w-16 object-contain"
                />
                <label className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-brand-soft">
                  {busy === "logo" ? "جارٍ الرفع…" : "رفع شعار"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => pickLogo(e.target.files?.[0])}
                  />
                </label>
                {c.brand.logoAsset && (
                  <Button variant="ghost" onClick={() => patch("brand", { logoAsset: "" })}>
                    استعادة الافتراضي
                  </Button>
                )}
              </div>
            </div>
            <Field label="الجوال (للعرض)">
              <Input
                dir="ltr"
                value={c.contact.phone}
                onChange={(e) => patch("contact", { phone: e.target.value })}
              />
            </Field>
            <Field label="رقم واتساب (أرقام فقط مع رمز الدولة)" hint="مثال: 966551234567">
              <Input
                dir="ltr"
                value={c.contact.whatsapp}
                onChange={(e) => patch("contact", { whatsapp: e.target.value })}
              />
            </Field>
            <Field label="البريد الإلكتروني" className="sm:col-span-2">
              <Input
                dir="ltr"
                value={c.contact.email}
                onChange={(e) => patch("contact", { email: e.target.value })}
              />
            </Field>
            <Field label="عنوان الصفحة في محركات البحث">
              <Input
                value={c.seo.title}
                onChange={(e) => patch("seo", { title: e.target.value })}
              />
            </Field>
            <Field label="وصف الصفحة في محركات البحث">
              <Input
                value={c.seo.description}
                onChange={(e) => patch("seo", { description: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section title="الأقسام الظاهرة">
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(SHOW_LABEL) as (keyof SiteContent["show"])[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.show[k]}
                  onChange={(e) => patch("show", { [k]: e.target.checked })}
                />
                {SHOW_LABEL[k]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            المنتجات التي تظهر في الموقع تُحدَّد من{" "}
            <Link to="/products" className="text-brand hover:underline">
              «المنتجات والخدمات»
            </Link>{" "}
            (حالة «منشور» مع «يظهر في الموقع»).
          </p>
        </Section>

        <Section title="الواجهة الأولى">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الشارة فوق العنوان" className="sm:col-span-2">
              <Input
                value={c.hero.badge}
                onChange={(e) => patch("hero", { badge: e.target.value })}
              />
            </Field>
            <Field label="العنوان (سطر جديد = سطر في الصفحة)" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={c.hero.title}
                onChange={(e) => patch("hero", { title: e.target.value })}
              />
            </Field>
            <Field label="الكلمة المميزة بلون الهوية">
              <Input
                value={c.hero.accent}
                onChange={(e) => patch("hero", { accent: e.target.value })}
              />
            </Field>
            <div />
            <Field label="الوصف" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={c.hero.lead}
                onChange={(e) => patch("hero", { lead: e.target.value })}
              />
            </Field>
            <Field label="زر الطلب">
              <Input
                value={c.hero.primaryCta}
                onChange={(e) => patch("hero", { primaryCta: e.target.value })}
              />
            </Field>
            <Field label="الزر الثاني (يقود إلى الأعمال)">
              <Input
                value={c.hero.secondaryCta}
                onChange={(e) => patch("hero", { secondaryCta: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section title="جهات نفذنا معها وشعاراتها">
          <Field label="عنوان القسم">
            <Input
              value={c.trust.title}
              onChange={(e) => patch("trust", { title: e.target.value })}
            />
          </Field>
          <TrustLogosEditor
            items={trustItems(c.trust)}
            onChange={(items) => patch("trust", { items, names: [] })}
          />
        </Section>

        <Section title="لماذا نحن">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التصنيف">
              <Input
                value={c.why.eyebrow}
                onChange={(e) => patch("why", { eyebrow: e.target.value })}
              />
            </Field>
            <Field label="العنوان">
              <Input
                value={c.why.title}
                onChange={(e) => patch("why", { title: e.target.value })}
              />
            </Field>
            {(["without", "with"] as const).map((k) => (
              <div key={k} className="space-y-3 rounded-xl border p-4">
                <Field label={k === "without" ? "بطاقة «بدون»: التسمية" : "بطاقة «معنا»: التسمية"}>
                  <Input
                    value={c.why[k].label}
                    onChange={(e) => patch("why", { [k]: { ...c.why[k], label: e.target.value } })}
                  />
                </Field>
                <Field label="العنوان">
                  <Input
                    value={c.why[k].title}
                    onChange={(e) => patch("why", { [k]: { ...c.why[k], title: e.target.value } })}
                  />
                </Field>
                <LinesField
                  label="النقاط"
                  rows={3}
                  value={c.why[k].items}
                  onChange={(items) => patch("why", { [k]: { ...c.why[k], items } })}
                />
              </div>
            ))}
          </div>
        </Section>

        <Section title="الخدمات">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التصنيف">
              <Input
                value={c.services.eyebrow}
                onChange={(e) => patch("services", { eyebrow: e.target.value })}
              />
            </Field>
            <Field label="العنوان">
              <Input
                value={c.services.title}
                onChange={(e) => patch("services", { title: e.target.value })}
              />
            </Field>
            <Field label="الوصف" className="sm:col-span-2">
              <Input
                value={c.services.lead}
                onChange={(e) => patch("services", { lead: e.target.value })}
              />
            </Field>
          </div>
          <Repeater
            items={c.services.items}
            max={12}
            addLabel="إضافة خدمة"
            onChange={(items) => patch("services", { items })}
            make={() =>
              ({
                title: "",
                text: "",
                productSlug: "",
                featured: false,
              }) as SiteContent["services"]["items"][number]
            }
            render={(s, set) => (
              <>
                <Field label="العنوان">
                  <Input value={s.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <IconSelect value={s.icon} onChange={(icon) => set({ icon })} />
                <Field label="الوصف" className="sm:col-span-2">
                  <Input value={s.text} onChange={(e) => set({ text: e.target.value })} />
                </Field>
                <Field label="ربط بمنتج" hint="يفتح صفحة المنتج إن كان منشوراً في الموقع">
                  <Select
                    value={s.productSlug}
                    onChange={(e) => set({ productSlug: e.target.value })}
                  >
                    <option value="">بدون ربط</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="mt-7 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.featured}
                    onChange={(e) => set({ featured: e.target.checked })}
                  />
                  بطاقة داكنة مميزة
                </label>
              </>
            )}
          />
        </Section>

        <Section title="كيف نعمل">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التصنيف">
              <Input
                value={c.method.eyebrow}
                onChange={(e) => patch("method", { eyebrow: e.target.value })}
              />
            </Field>
            <Field label="العنوان">
              <Input
                value={c.method.title}
                onChange={(e) => patch("method", { title: e.target.value })}
              />
            </Field>
          </div>
          <TitleTextList
            items={c.method.steps}
            onChange={(steps) => patch("method", { steps })}
            addLabel="إضافة خطوة"
            icons={false}
          />
        </Section>

        <Section title="أعمالنا">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التصنيف">
              <Input
                value={c.works.eyebrow}
                onChange={(e) => patch("works", { eyebrow: e.target.value })}
              />
            </Field>
            <Field label="العنوان">
              <Input
                value={c.works.title}
                onChange={(e) => patch("works", { title: e.target.value })}
              />
            </Field>
          </div>
          <Repeater
            items={c.works.items}
            max={12}
            addLabel="إضافة مشروع"
            onChange={(items) => patch("works", { items })}
            make={() => ({ category: "", title: "", text: "", entity: "", beneficiaries: "" })}
            render={(w, set) => (
              <>
                <Field label="اسم المشروع">
                  <Input value={w.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
                <Field label="التصنيف">
                  <Input value={w.category} onChange={(e) => set({ category: e.target.value })} />
                </Field>
                <Field label="الجهة">
                  <Input value={w.entity} onChange={(e) => set({ entity: e.target.value })} />
                </Field>
                <Field label="المستفيدون">
                  <Input
                    value={w.beneficiaries}
                    onChange={(e) => set({ beneficiaries: e.target.value })}
                  />
                </Field>
                <Field label="الوصف" className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={w.text}
                    onChange={(e) => set({ text: e.target.value })}
                  />
                </Field>
              </>
            )}
          />
          <h4 className="pt-2 font-semibold">أرقام وإحصاءات</h4>
          <p className="text-xs text-muted">اكتب أرقاماً صحيحة فقط: يراها كل زائر.</p>
          <Repeater
            items={c.works.stats}
            max={6}
            addLabel="إضافة رقم"
            onChange={(stats) => patch("works", { stats })}
            make={() => ({ value: "", label: "" })}
            render={(s, set) => (
              <>
                <Field label="الرقم">
                  <Input value={s.value} onChange={(e) => set({ value: e.target.value })} />
                </Field>
                <Field label="الوصف">
                  <Input value={s.label} onChange={(e) => set({ label: e.target.value })} />
                </Field>
              </>
            )}
          />
        </Section>

        <Section title="الأسئلة الشائعة">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان">
              <Input
                value={c.faq.title}
                onChange={(e) => patch("faq", { title: e.target.value })}
              />
            </Field>
            <Field label="الوصف">
              <Input value={c.faq.lead} onChange={(e) => patch("faq", { lead: e.target.value })} />
            </Field>
          </div>
          <Repeater
            items={c.faq.items}
            max={12}
            addLabel="إضافة سؤال"
            onChange={(items) => patch("faq", { items })}
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

        <Section title="الدعوة الختامية">
          <Field label="العنوان">
            <Textarea
              rows={2}
              value={c.cta.title}
              onChange={(e) => patch("cta", { title: e.target.value })}
            />
          </Field>
          <Field label="الوصف">
            <Input value={c.cta.lead} onChange={(e) => patch("cta", { lead: e.target.value })} />
          </Field>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm text-muted">
            {dirty ? "تغييرات غير محفوظة" : "كل التغييرات محفوظة"}
          </span>
          <Button onClick={save} disabled={!dirty || busy !== ""}>
            {busy === "save" ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </div>
    </div>
  );
}
