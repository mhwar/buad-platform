import { type SiteContent, trustItems } from "@buad/schema/site";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, Circle, Copy, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "../../components/ui";
import { ago, ok } from "../../lib/format";
import { IconSelect, LinesField, Repeater, TitleTextList } from "../products/editors";
import { productsQuery, STATUS_LABEL, sendJson } from "../products/products-api";
import { projectsQuery } from "../projects/api";
import { type EditorTab, type HealthItem, healthScore, SECTION_LABEL } from "./health";
import { ImagePicker } from "./ImagePicker";
import { TrustLogosEditor } from "./TrustLogosEditor";

export type Patch = <K extends keyof SiteContent>(k: K, v: Partial<SiteContent[K]>) => void;
export type TabProps = {
  c: SiteContent;
  patch: Patch;
  busy: string;
  pickLogo: (f?: File) => unknown;
};

export const ACCENT_LABEL: Record<string, string> = {
  "#5B3FE0": "بنفسجي",
  "#0B1550": "كحلي",
  "#F04E23": "برتقالي",
};
export const SHOW_LABEL: Record<keyof SiteContent["show"], string> = {
  trust: "جهات نفذنا معها",
  why: "لماذا نحن",
  services: "الخدمات",
  products: "المنتجات المنشورة",
  method: "كيف نعمل",
  works: "أعمالنا",
  faq: "الأسئلة الشائعة",
  testimonials: "آراء العملاء",
};

export const Section = ({
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

/** «الهوية والتواصل» */
export function IdentityTab({ c, patch, busy, pickLogo }: TabProps) {
  return (
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
          {(
            [
              ["x", "حساب X"],
              ["linkedin", "LinkedIn"],
              ["instagram", "Instagram"],
              ["youtube", "YouTube"],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={`${l} (الرابط كاملاً)`}>
              <Input
                dir="ltr"
                placeholder="https://"
                value={c.contact.socials[k]}
                onChange={(e) =>
                  patch("contact", { socials: { ...c.contact.socials, [k]: e.target.value } })
                }
              />
            </Field>
          ))}
          <Field label="عنوان الصفحة في محركات البحث">
            <Input value={c.seo.title} onChange={(e) => patch("seo", { title: e.target.value })} />
          </Field>
          <Field label="وصف الصفحة في محركات البحث">
            <Input
              value={c.seo.description}
              onChange={(e) => patch("seo", { description: e.target.value })}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

/** «الصفحة الرئيسية» */
export function HomeTab({ c, patch }: TabProps) {
  return (
    <div className="space-y-3">
      <Section title="الأقسام الظاهرة" open>
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
      <Section title="الواجهة الأولى" open>
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
          <div className="sm:col-span-2">
            <ImagePicker
              label="صورة بجانب العنوان (اختيارية)"
              hint="صورة حقيقية من أعمالكم أو فريقكم تزيد الثقة؛ تظهر بجانب العنوان على الحاسوب وتحته على الجوال."
              value={c.hero.imageAsset}
              onChange={(imageAsset) => patch("hero", { imageAsset })}
            />
          </div>
        </div>
      </Section>
      <Section title="لماذا نحن" open>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التصنيف">
            <Input
              value={c.why.eyebrow}
              onChange={(e) => patch("why", { eyebrow: e.target.value })}
            />
          </Field>
          <Field label="العنوان">
            <Input value={c.why.title} onChange={(e) => patch("why", { title: e.target.value })} />
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
      <Section title="كيف نعمل" open>
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
      <Section title="آراء العملاء" open>
        <Field label="العنوان">
          <Input
            value={c.testimonials.title}
            placeholder="قالوا عنّا"
            onChange={(e) => patch("testimonials", { title: e.target.value })}
          />
        </Field>
        <Repeater
          items={c.testimonials.items}
          max={8}
          addLabel="إضافة رأي"
          onChange={(items) => patch("testimonials", { items })}
          make={() => ({ quote: "", name: "", role: "", entity: "" })}
          render={(t, set) => (
            <>
              <Field label="ما قاله العميل" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={t.quote}
                  onChange={(e) => set({ quote: e.target.value })}
                />
              </Field>
              <Field label="الاسم">
                <Input value={t.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="الصفة">
                <Input value={t.role} onChange={(e) => set({ role: e.target.value })} />
              </Field>
              <Field label="الجهة" className="sm:col-span-2">
                <Input value={t.entity} onChange={(e) => set({ entity: e.target.value })} />
              </Field>
            </>
          )}
        />
        <p className="text-xs text-muted">أضف آراء حقيقية بإذن أصحابها فقط.</p>
      </Section>
      <Section title="الأسئلة الشائعة" open>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="العنوان">
            <Input value={c.faq.title} onChange={(e) => patch("faq", { title: e.target.value })} />
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
      <Section title="الدعوة الختامية" open>
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
  );
}

/** «الخدمات والمنتجات» */
export function ServicesTab({ c, patch }: TabProps) {
  const products = useQuery(productsQuery);
  return (
    <div className="space-y-3">
      <Section title="الخدمات" open>
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
      <ProductsPanel c={c} patch={patch} />
    </div>
  );
}

/** «الجهات والأعمال» */
export function WorksTab({ c, patch }: TabProps) {
  return (
    <div className="space-y-3">
      <Section title="جهات نفذنا معها وشعاراتها" open>
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
      <Section title="أعمالنا" open>
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
                <Textarea rows={2} value={w.text} onChange={(e) => set({ text: e.target.value })} />
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
      <SuggestFromProjects c={c} patch={patch} />
    </div>
  );
}

/** Which products the site shows, and in what order. */
function ProductsPanel({ c, patch }: { c: SiteContent; patch: Patch }) {
  const qc = useQueryClient();
  const q = useQuery(productsQuery);
  const list = q.data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["site-overview"] });
  };
  const toggle = useMutation({
    mutationFn: async (p: (typeof list)[number]) =>
      ok(
        await sendJson(`/api/products/${p.id}`, "PATCH", {
          version: p.version,
          showOnSite: !p.showOnSite,
        }),
      ),
    onSuccess: refresh,
  });
  const move = useMutation({
    mutationFn: async ({ i, d }: { i: number; d: number }) => {
      const ids = list.map((x) => x.id);
      const j = i + d;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
      await ok(await sendJson("/api/products/reorder", "POST", { ids }));
    },
    onSuccess: refresh,
  });
  return (
    <Section title="المنتجات في الموقع" open>
      <p className="text-sm text-muted">
        يظهر المنتج هنا وفي الموقع حين تكون حالته «منشور» ومفعّلاً أدناه. الترتيب هو ترتيب ظهورها.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-muted">لا منتجات بعد. أنشئها من «المنتجات والخدمات».</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {list.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="flex flex-col">
                <button
                  type="button"
                  aria-label="للأعلى"
                  disabled={i === 0 || move.isPending}
                  onClick={() => move.mutate({ i, d: -1 })}
                  className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="للأسفل"
                  disabled={i === list.length - 1 || move.isPending}
                  onClick={() => move.mutate({ i, d: 1 })}
                  className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-30"
                >
                  <ArrowDown className="size-4" />
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  to="/products/$id"
                  params={{ id: p.id }}
                  className="font-semibold hover:text-brand"
                >
                  {p.name}
                </Link>
                <span className="mt-0.5 block">
                  <Badge tone={p.status === "published" ? "green" : "gray"}>
                    {STATUS_LABEL[p.status]}
                  </Badge>
                </span>
              </span>
              {!c.services.items.some((x) => x.productSlug === p.slug) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    patch("services", {
                      items: [
                        ...c.services.items,
                        {
                          title: p.name,
                          text: p.tagline,
                          icon: "briefcase",
                          productSlug: p.slug,
                          featured: false,
                        },
                      ],
                    })
                  }
                >
                  إضافة بطاقة في الموقع
                </Button>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.showOnSite}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate(p)}
                />
                ظاهر في الموقع
              </label>
              {p.showOnSite && p.status !== "published" && (
                <span className="basis-full text-xs text-amber-700 dark:text-amber-300">
                  لن يظهر قبل أن تصبح حالته «منشور».
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Completed projects from the platform, offered as candidates for «أعمالنا» (never added on their own). */
function SuggestFromProjects({ c, patch }: { c: SiteContent; patch: Patch }) {
  const q = useQuery(projectsQuery({ status: "completed" }));
  const items = (q.data?.items ?? []).filter((p) => !c.works.items.some((w) => w.title === p.name));
  const total = q.data?.items.length ?? 0;
  return (
    <Section title="اقتراح من مشاريعك المكتملة" open>
      <p className="text-sm text-muted">
        عندك {total} مشروع مكتمل في المنصة. اختر ما تريد عرضه فقط: لا يُنشر شيء من مشاريعك دون
        اختيارك، ثم أكمل وصفه وعدد المستفيدين بنفسك.
      </p>
      {total > 0 && (
        <Button
          variant="secondary"
          onClick={() =>
            patch("works", {
              stats: [...c.works.stats, { value: String(total), label: "مشاريع مكتملة" }],
            })
          }
        >
          أضف رقم «{total} مشاريع مكتملة» إلى الإحصاءات
        </Button>
      )}
      {items.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {items.slice(0, 20).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <span>
                <b>{p.name}</b>
                <span className="block text-xs text-muted">{p.clientName}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  patch("works", {
                    items: [
                      ...c.works.items,
                      {
                        category: "",
                        title: p.name,
                        text: "",
                        entity: p.clientName,
                        beneficiaries: "",
                      },
                    ],
                  })
                }
              >
                إضافة إلى أعمالنا
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** «نظرة عامة»: state, what changed, health, and the requests picture. */
export function OverviewTab({
  c,
  data,
  health,
  overview,
  goTab,
  dirty,
  busy,
  onUnpublish,
}: {
  c: SiteContent;
  data: { isPublished: boolean; publishedAt: number; changed: boolean };
  health: HealthItem[];
  overview?: {
    changedSections: string[];
    requests: { last30: number; new: number; stale: number; won: number; total: number };
  };
  goTab: (t: EditorTab) => void;
  dirty: boolean;
  busy: string;
  onUnpublish: () => void;
}) {
  const score = healthScore(health);
  const failing = health.filter((h) => !h.ok);
  const url = `${window.location.origin}/site`;
  const r = overview?.requests;
  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">حالة النشر</h3>
            <p className="mt-1 text-sm text-muted">
              {data.isPublished
                ? `منشور منذ ${ago(data.publishedAt)}`
                : "غير منشور: لا يراه الزوار قبل أن تنشره."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.isPublished && (
              <Button variant="ghost" disabled={busy !== ""} onClick={onUnpublish}>
                إيقاف النشر
              </Button>
            )}
          </div>
        </div>
        {dirty && <Notice tone="amber">احفظ تغييراتك أولاً ثم انشر من زر «نشر» أعلى الصفحة.</Notice>}
        {data.isPublished && overview && overview.changedSections.length > 0 && (
          <div className="text-sm">
            <p className="mb-1 font-medium">تعديلات لم تُنشر بعد:</p>
            <div className="flex flex-wrap gap-1.5">
              {overview.changedSections.map((k) => (
                <Badge key={k} tone="amber">
                  {SECTION_LABEL[k] ?? k}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {data.isPublished && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span dir="ltr" className="rounded-lg border bg-canvas/40 px-2.5 py-1 font-mono">
              {url}
            </span>
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url)}>
              <Copy className="size-4" /> نسخ الرابط
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-bold">جاهزية الموقع</h3>
          <span
            className={`text-2xl font-bold ${score >= 80 ? "text-emerald-700 dark:text-emerald-300" : score >= 50 ? "text-amber-700 dark:text-amber-300" : "text-red-600"}`}
          >
            {score}%
          </span>
        </div>
        <ul className="space-y-2 text-sm">
          {[...failing, ...health.filter((h) => h.ok)].map((h) => (
            <li key={h.key} className="flex items-start gap-2">
              {h.ok ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              )}
              <span className="flex-1">
                {h.label}
                {!h.ok && h.hint && <span className="block text-xs text-muted">{h.hint}</span>}
              </span>
              {!h.ok && (
                <button
                  type="button"
                  onClick={() => goTab(h.tab)}
                  className="text-xs text-brand hover:underline"
                >
                  عالجها
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {r && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">الطلبات القادمة من الموقع</h3>
            <Link
              to="/products"
              search={{ tab: "requests" }}
              className="text-sm text-brand hover:underline"
            >
              فتح الصندوق
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-canvas/50 p-3">
              <p className="text-2xl font-bold">{r.new}</p>
              <p className="text-xs text-muted">جديدة</p>
            </div>
            <div className="rounded-xl bg-canvas/50 p-3">
              <p className="text-2xl font-bold">{r.last30}</p>
              <p className="text-xs text-muted">آخر 30 يوماً</p>
            </div>
            <div className="rounded-xl bg-canvas/50 p-3">
              <p className="text-2xl font-bold">
                {r.total ? `${Math.round((r.won / r.total) * 100)}%` : "—"}
              </p>
              <p className="text-xs text-muted">تحويل إلى تعاقد (90 يوماً)</p>
            </div>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted">اسم الجهة في الموقع: {c.brand.name}</p>
    </div>
  );
}

/** «نموذج الطلب»: the wording and optional fields of the public request form. */
export function FormTab({ c, patch }: TabProps) {
  const f = c.form;
  const set = (v: Partial<SiteContent["form"]>) => patch("form", v);
  return (
    <div className="space-y-3">
      <Section title="نص النموذج" open>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان النموذج">
            <Input value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="نص زر الإرسال">
            <Input value={f.submitLabel} onChange={(e) => set({ submitLabel: e.target.value })} />
          </Field>
          <Field label="مقدمة قصيرة فوق الحقول" className="sm:col-span-2">
            <Textarea rows={2} value={f.intro} onChange={(e) => set({ intro: e.target.value })} />
          </Field>
          <Field label="رسالة النجاح بعد الإرسال" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={f.successMessage}
              onChange={(e) => set({ successMessage: e.target.value })}
            />
          </Field>
        </div>
      </Section>
      <Section title="الحقول الاختيارية" open>
        <p className="text-sm text-muted">
          الاسم مطلوب دائماً، ويكفي جوال أو بريد. كلما قلّت الحقول زادت الطلبات.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["showEntity", "اسم الجهة"],
              ["showEmail", "البريد الإلكتروني"],
              ["showMessage", "الملاحظات"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f[k]}
                onChange={(e) => set({ [k]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </Section>
      <Notice tone="blue">
        أسئلة كل منتج (عدد المستفيدين، المدينة…) تُحرَّر من خطوة «الاستبيان» داخل المنتج في{" "}
        <Link to="/products" className="underline">
          المنتجات والخدمات
        </Link>
        ، وتظهر في هذا النموذج تلقائياً.
      </Notice>
    </div>
  );
}

const Counter = ({ n, min, max }: { n: number; min: number; max: number }) => (
  <span
    className={
      n >= min && n <= max
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-amber-700 dark:text-amber-300"
    }
  >
    {n} حرفاً (المثالي {min}–{max})
  </span>
);

/** «البحث والمشاركة»: how the page appears in Google and when the link is shared. */
export function SeoTab({ c, patch }: TabProps) {
  const logo = c.brand.logoAsset ? `/api/assets/${c.brand.logoAsset}` : "/site/logo.png";
  const url = `${window.location.host}/site`;
  return (
    <div className="space-y-4">
      <Section title="عنوان الصفحة ووصفها" open>
        <Field label="العنوان">
          <Input value={c.seo.title} onChange={(e) => patch("seo", { title: e.target.value })} />
        </Field>
        <p className="text-xs">
          <Counter n={c.seo.title.trim().length} min={20} max={60} />
        </p>
        <Field label="الوصف">
          <Textarea
            rows={3}
            value={c.seo.description}
            onChange={(e) => patch("seo", { description: e.target.value })}
          />
        </Field>
        <p className="text-xs">
          <Counter n={c.seo.description.trim().length} min={80} max={160} />
        </p>
      </Section>
      <Section title="كيف يبدو" open>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-muted">نتيجة البحث</p>
            <div className="rounded-xl border bg-white p-4 text-start" dir="rtl">
              <p className="text-xs text-slate-500" dir="ltr">
                {url}
              </p>
              <p className="mt-0.5 text-lg text-blue-700">{c.seo.title || c.brand.name}</p>
              <p className="mt-1 text-sm text-slate-600">{c.seo.description.slice(0, 160)}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">مشاركة الرابط (واتساب وغيره)</p>
            <div className="overflow-hidden rounded-xl border bg-white" dir="rtl">
              <div className="flex h-32 items-center justify-center bg-slate-100">
                <img src={logo} alt="" className="h-20 object-contain" />
              </div>
              <div className="border-t p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {c.seo.title || c.brand.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{c.seo.description}</p>
                <p className="mt-1 text-xs text-slate-400" dir="ltr">
                  {window.location.host}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

type HistoryRow = { id: string; publishedAt: number; by: string; live: boolean };
/** «سجل النشر»: every publish, and putting an earlier one back as the draft. */
export function HistoryTab({ dirty }: { dirty: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["site-history"],
    queryFn: async () =>
      (await ok<{ history: HistoryRow[] }>(await fetch("/api/site/history"))).history,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => ok(await sendJson(`/api/site/history/${id}/restore`, "POST")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site-draft"] }),
  });
  const list = q.data ?? [];
  if (q.isPending)
    return <div className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!list.length)
    return (
      <EmptyState
        title="لا نشر سابق"
        text="يظهر هنا كل نشر تقوم به، ويمكنك العودة إلى أي نسخة سابقة."
      />
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        الاستعادة تضع النسخة القديمة كمسودة فقط، ولا يتغير الموقع للزوار حتى تنشرها.
      </p>
      {dirty && <Notice tone="amber">احفظ تغييراتك الحالية أولاً قبل استعادة نسخة سابقة.</Notice>}
      <Card className="divide-y p-0">
        {list.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              <b>{ago(h.publishedAt)}</b>
              {h.by && <span className="text-muted"> · {h.by}</span>}
            </span>
            {h.live ? (
              <Badge tone="green">المنشور الآن</Badge>
            ) : (
              <Button
                variant="secondary"
                disabled={dirty || restore.isPending}
                onClick={() => restore.mutate(h.id)}
              >
                <RotateCcw className="size-4" /> استعادة كمسودة
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
