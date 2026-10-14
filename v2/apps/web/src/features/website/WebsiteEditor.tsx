import type { SiteContent } from "@buad/schema/site";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ExternalLink, Monitor, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StepNav } from "../../components/StepNav";
import { Badge, Button, Notice, PageHeader } from "../../components/ui";
import { ApiError, ago, ok } from "../../lib/format";
import { uploadImage } from "../org/OrgSettings";
import { sendJson } from "../products/products-api";
import { useFontStatus } from "../site/font-status";
import { type EditorTab, siteHealth } from "./health";
import {
  FormTab,
  HistoryTab,
  HomeTab,
  IdentityTab,
  OverviewTab,
  type Patch,
  SeoTab,
  ServicesTab,
  WorksTab,
} from "./tabs";

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
type Overview = {
  changedSections: string[];
  requests: { last30: number; new: number; stale: number; won: number; total: number };
  listedSlugs: string[];
  unlistedPublished: number;
};
const overviewQuery = {
  queryKey: ["site-overview"],
  queryFn: async () => ok<Overview & { ok: true }>(await fetch("/api/site/overview")),
};

const TABS: { key: EditorTab; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "identity", label: "الهوية والتواصل" },
  { key: "home", label: "الصفحة الرئيسية" },
  { key: "services", label: "الخدمات والمنتجات" },
  { key: "works", label: "الجهات والأعمال" },
  { key: "form", label: "نموذج الطلب" },
  { key: "seo", label: "البحث والمشاركة" },
  { key: "history", label: "سجل النشر" },
];

/** «الموقع»: edit the public website as a draft with a live preview, check it, publish it. */
export function WebsiteEditorPage() {
  const q = useQuery(draftQuery);
  if (q.isPending)
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (!q.data) return <Notice>تعذّر تحميل الموقع</Notice>;
  return <Editor key={q.data.version} data={q.data} />;
}

function Editor({ data }: { data: Draft }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const tab = (useSearch({ strict: false }) as { tab?: EditorTab }).tab ?? "overview";
  const overview = useQuery(overviewQuery).data;
  const fonts = useFontStatus();
  const [c, setC] = useState<SiteContent>(data.content);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "logo">("");
  const [msg, setMsg] = useState<{ tone: "red" | "amber" | "blue"; text: string } | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(data.content);
  const patch: Patch = (k, v) => setC((x) => ({ ...x, [k]: { ...(x[k] as object), ...v } }));
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["site-draft"] }),
      qc.invalidateQueries({ queryKey: ["site-overview"] }),
      qc.invalidateQueries({ queryKey: ["site-history"] }),
    ]);
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
  const publish = () =>
    run("publish", async () => ok(await sendJson("/api/site/publish", "POST")), "تم نشر الموقع");
  const unpublish = () =>
    run("unpublish", async () => ok(await sendJson("/api/site/unpublish", "POST")), "أُوقف النشر");
  const goTab = (t: EditorTab) => nav({ to: "/website", search: { tab: t }, replace: true });

  const health = siteHealth(c, {
    listedSlugs: overview?.listedSlugs ?? [],
    isPublished: data.isPublished,
    changedSections: overview?.changedSections ?? [],
    staleRequests: overview?.requests.stale ?? 0,
    fonts,
  });
  const issues = health.filter((h) => !h.ok).length;
  const props = { c, patch, busy, pickLogo };

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
            : "حرّر المحتوى وراقب المعاينة ثم انشره ليراه الزوار."
        }
        actions={
          <>
            <a href="/site?preview=1" target="_blank" rel="noreferrer">
              <Button variant="secondary" disabled={dirty}>
                <ExternalLink className="size-4" /> فتح المعاينة
              </Button>
            </a>
            <Button
              disabled={dirty || busy !== "" || (data.isPublished && !data.changed)}
              onClick={publish}
            >
              {busy === "publish" ? "جارٍ النشر…" : "نشر"}
            </Button>
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <StepNav
            steps={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              badge: t.key === "overview" ? issues : undefined,
            }))}
            value={tab}
            onChange={goTab}
          />
          {tab === "overview" && (
            <OverviewTab
              c={c}
              data={data}
              health={health}
              overview={overview}
              goTab={goTab}
              dirty={dirty}
              busy={busy}
              onPublish={publish}
              onUnpublish={unpublish}
            />
          )}
          {tab === "identity" && <IdentityTab {...props} />}
          {tab === "home" && <HomeTab {...props} />}
          {tab === "services" && <ServicesTab {...props} />}
          {tab === "works" && <WorksTab {...props} />}
          {tab === "form" && <FormTab {...props} />}
          {tab === "seo" && <SeoTab {...props} />}
          {tab === "history" && <HistoryTab dirty={dirty} />}
        </div>
        <aside className="hidden xl:block" aria-label="معاينة الموقع">
          <PreviewPane version={data.version} dirty={dirty} />
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t bg-surface/95 backdrop-blur lg:bottom-0">
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

const DEVICES = {
  phone: { w: 390, label: "جوال", Icon: Smartphone },
  tablet: { w: 768, label: "لوحي", Icon: Tablet },
  desktop: { w: 1280, label: "حاسوب", Icon: Monitor },
} as const;

/** The saved draft in an iframe, scaled to fit, reloaded after every save. */
function PreviewPane({ version, dirty }: { version: number; dirty: boolean }) {
  const [device, setDevice] = useState<keyof typeof DEVICES>("phone");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = DEVICES[device].w;
  const scale = Math.min(1, width / W);
  const H = 620;
  return (
    <div className="sticky top-24 space-y-2">
      <div className="flex items-center justify-between">
        <div
          className="flex gap-1 rounded-lg border bg-surface p-0.5"
          role="group"
          aria-label="حجم الجهاز"
        >
          {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((k) => {
            const { Icon, label } = DEVICES[k];
            return (
              <button
                key={k}
                type="button"
                aria-label={label}
                aria-pressed={device === k}
                onClick={() => setDevice(k)}
                className={`rounded-md p-1.5 ${device === k ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted">
          {dirty ? "احفظ لتحديث المعاينة" : "معاينة المسودة"}
        </span>
      </div>
      <div ref={box} className="overflow-hidden rounded-2xl border bg-white" style={{ height: H }}>
        <iframe
          key={`${version}-${device}`}
          title="معاينة الموقع"
          src={`/site?preview=1&v=${version}`}
          style={{
            width: W,
            height: H / scale,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top right",
          }}
        />
      </div>
    </div>
  );
}
