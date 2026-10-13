import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pills,
  SearchBox,
  Select,
  ViewToggle,
} from "../../components/ui";
import { money } from "../../lib/format";
import { CLIENT_TYPE_LABELS, label } from "../labels";
import { type ClientListItem, type ClientType, clientsQuery } from "./api";
import { ClientDialog } from "./ClientDialog";

const route = getRouteApi("/clients");

export function ClientsPage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const q = useDeferredValue(s.q ?? "");
  const list = useQuery(
    clientsQuery({ q, type: s.type, sort: s.sort, archived: s.archived ? "1" : "0" }),
  );
  const [adding, setAdding] = useState(false);
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const items = list.data?.items ?? [];
  const filtering = !!(q || s.type);

  return (
    <>
      <PageHeader
        title={s.archived ? "العملاء المؤرشفون" : "العملاء"}
        subtitle={list.data ? `${total} عميل` : " "}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> عميل جديد
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={s.q ?? ""}
          onChange={(v) => set({ q: v || undefined })}
          placeholder="ابحث بالاسم أو الرقم أو المدينة أو البريد"
        />
        <Select
          aria-label="الترتيب"
          value={s.sort ?? "newest"}
          onChange={(e) => set({ sort: e.target.value as typeof s.sort })}
          className="w-auto"
        >
          <option value="newest">الأحدث</option>
          <option value="name">الاسم</option>
          <option value="value">قيمة المشاريع</option>
        </Select>
        <ViewToggle value={s.view ?? "grid"} onChange={(v) => set({ view: v })} />
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Pills<ClientType>
          value={(s.type ?? "") as ClientType | ""}
          onChange={(v) => set({ type: v || undefined })}
          items={[
            { value: "", label: "الكل", count: total },
            ...Object.entries(CLIENT_TYPE_LABELS).map(([k, l]) => ({
              value: k as ClientType,
              label: l,
              count: counts[k] ?? 0,
            })),
          ]}
        />
        <button
          type="button"
          onClick={() => set({ archived: s.archived ? undefined : true })}
          className="text-sm text-muted underline hover:text-ink"
        >
          {s.archived ? "عرض العملاء الحاليين" : "عرض المؤرشف"}
        </button>
      </div>

      {list.isPending ? (
        <p className="text-muted">جارٍ التحميل…</p>
      ) : list.isError ? (
        <EmptyState
          title="تعذّر تحميل العملاء"
          action={<Button onClick={() => list.refetch()}>إعادة المحاولة</Button>}
        />
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState title="لا نتائج" text="جرّبوا كلمة بحث أخرى أو أزيلوا عامل التصفية." />
        ) : s.archived ? (
          <EmptyState title="لا يوجد عملاء مؤرشفون" />
        ) : (
          <EmptyState
            title="لا يوجد عملاء بعد"
            text="ابدؤوا بتسجيل أول عميل، ثم أضيفوا مشاريعه من صفحته."
            action={
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" /> عميل جديد
              </Button>
            }
          />
        )
      ) : (s.view ?? "grid") === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <ClientCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        <ClientTable items={items} />
      )}
      <ClientDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function ClientCard({ c }: { c: ClientListItem }) {
  return (
    <Link to="/clients/$id" params={{ id: c.id }} className="group block">
      <Card className="h-full transition group-hover:border-brand group-hover:shadow-md">
        <div className="flex items-start gap-3">
          <Avatar name={c.name} logo={c.logo} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c.name}</p>
            <p className="text-xs text-muted" dir="ltr">
              {c.code}
            </p>
          </div>
          <Badge>{label(CLIENT_TYPE_LABELS, c.type)}</Badge>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted">{c.city || "—"}</span>
          <span>
            {c.projectCount} {c.projectCount === 1 ? "مشروع" : "مشاريع"}
            {c.projectValue > 0 && <span className="text-muted"> · {money(c.projectValue)}</span>}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function ClientTable({ items }: { items: ClientListItem[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b text-right text-xs text-muted">
          <tr>
            <th className="p-3 font-medium">العميل</th>
            <th className="p-3 font-medium">الرقم</th>
            <th className="p-3 font-medium">النوع</th>
            <th className="p-3 font-medium">المدينة</th>
            <th className="p-3 font-medium">المشاريع</th>
            <th className="p-3 font-medium">قيمة المشاريع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b last:border-0 hover:bg-brand-soft/50">
              <td className="p-3">
                <Link
                  to="/clients/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-2 font-semibold hover:text-brand"
                >
                  <Avatar name={c.name} logo={c.logo} />
                  {c.name}
                </Link>
              </td>
              <td className="p-3 text-muted" dir="ltr">
                {c.code}
              </td>
              <td className="p-3">{label(CLIENT_TYPE_LABELS, c.type)}</td>
              <td className="p-3">{c.city || "—"}</td>
              <td className="p-3">{c.projectCount}</td>
              <td className="p-3">{c.projectValue ? money(c.projectValue) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
