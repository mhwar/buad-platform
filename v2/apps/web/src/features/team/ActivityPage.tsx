import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FilterBar } from "../../components/FilterBar";
import { Badge, Card, EmptyState, Field, Input, PageHeader } from "../../components/ui";
import { ago, day, fromEpoch } from "../../lib/format";
import { auditQuery, teamUsersQuery } from "./queries";

const ENTITIES: Record<string, string> = {
  project: "المشاريع",
  client: "العملاء",
  document: "المستندات",
  company: "مالية الشركة",
  vat: "الضريبة",
  product: "المنتجات",
  request: "الطلبات",
  site: "الموقع",
  org: "المنشأة",
  user: "المستخدمون",
  role: "الأدوار",
  asset: "الملفات",
  import: "الاستيراد",
  task: "المهام",
  quote: "عروض الأسعار",
  plan: "الخطط",
  meeting: "الاجتماعات",
  decision: "القرارات",
};
const clock = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeStyle: "short" });
/** «17 أكتوبر 2026، 8:21 ص»: the platform's date, then the time. */
const when = (s: number) => `${fromEpoch(s)}، ${clock.format(new Date(s * 1000))}`;
/** Changed values that are dates read like every other date («30 نوفمبر 2026»). */
const shown = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? day(v) : v);

/** «سجل النشاط»: who changed what and when. Read-only. */
export function ActivityPage() {
  // Filters live in the address: a filtered log can be shared and survives a reload.
  const s = useSearch({ strict: false }) as Record<string, string | undefined>;
  const go = useNavigate();
  const setter = (k: string) => (v: string) =>
    go({ to: ".", search: (p: object) => ({ ...p, [k]: v || undefined }), replace: true } as never);
  const entity = s.entity ?? "";
  const user = s.user ?? "";
  const from = s.from ?? "";
  const to = s.to ?? "";
  const setEntity = setter("entity");
  const setUser = setter("user");
  const setFrom = setter("from");
  const setTo = setter("to");
  const q = useQuery(auditQuery({ entity, user, from, to }));
  const users = useQuery(teamUsersQuery);
  return (
    <div className="space-y-4">
      <PageHeader title="سجل النشاط" subtitle="من غيّر ماذا ومتى، بالقيم قبل التعديل وبعده." />
      <FilterBar
        fields={[
          {
            key: "entity",
            label: "القسم",
            value: entity,
            allLabel: "كل الأقسام",
            options: Object.entries(ENTITIES).map(([value, label]) => ({ value, label })),
          },
          {
            key: "user",
            label: "المستخدم",
            value: user,
            allLabel: "كل المستخدمين",
            options: (users.data ?? []).map((u) => ({ value: u.id, label: u.name || u.email })),
          },
        ]}
        onChange={(k, v) => (k === "entity" ? setEntity(v) : setUser(v))}
      />
      <details open={!!(from || to) || undefined}>
        <summary className="cursor-pointer text-sm text-muted select-none hover:text-ink">
          نطاق التاريخ{from || to ? `: ${from ? day(from) : "…"} – ${to ? day(to) : "…"}` : ""}
        </summary>
        <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </details>
      {q.data?.length === 0 && (
        <EmptyState title="لا نشاط مطابق" text="تظهر هنا التغييرات التي يجريها الفريق." />
      )}
      <ul className="space-y-2">
        {q.data?.map((i) => (
          <li key={i.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{i.summary}</p>
                <p className="text-xs text-muted">
                  {i.userName || "النظام"} · {when(i.at)} · {ago(i.at)}
                </p>
                <Changes detail={i.detail} />
              </div>
              <Badge>{ENTITIES[i.entity] ?? i.entity}</Badge>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Change = { field: string; label: string; before: string; after: string };
/** What a change did, field by field: «المبلغ: 50,000 ر.س ← 5,000 ر.س». */
function Changes({ detail }: { detail: Record<string, unknown> }) {
  const list = Array.isArray(detail.changes) ? (detail.changes as Change[]) : [];
  if (!list.length) return null;
  return (
    <ul aria-label="التغييرات" className="mt-1.5 space-y-0.5 text-sm">
      {list.map((c) => (
        <li key={c.field}>
          <span className="text-muted">{c.label}: </span>
          {c.before !== "—" && (
            <>
              <span className="text-red-700 line-through decoration-1 dark:text-red-400">
                {shown(c.before)}
              </span>
              <span className="mx-1 text-muted">←</span>
            </>
          )}
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            {shown(c.after)}
          </span>
        </li>
      ))}
    </ul>
  );
}
