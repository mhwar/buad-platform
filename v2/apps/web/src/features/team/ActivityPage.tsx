import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select } from "../../components/ui";
import { ago } from "../../lib/format";
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
const time = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="القسم">
          <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">الكل</option>
            {Object.entries(ENTITIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المستخدم">
          <Select value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">الكل</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="من تاريخ">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </Card>
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
                  {i.userName || "النظام"} · {time.format(new Date(i.at * 1000))} · {ago(i.at)}
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
                {c.before}
              </span>
              <span className="mx-1 text-muted">←</span>
            </>
          )}
          <span className="font-medium text-emerald-700 dark:text-emerald-400">{c.after}</span>
        </li>
      ))}
    </ul>
  );
}
