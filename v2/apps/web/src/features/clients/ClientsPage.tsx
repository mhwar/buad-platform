import { FOLLOW_UP_LABEL, followUpState, RELATIONSHIP_LABEL, RELATIONSHIPS } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { FileUp, Mail, MapPin, MessageCircle, Phone, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { SkeletonGrid } from "../../components/Resilience";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Menu,
  PageHeader,
  Pills,
  SearchBox,
  Select,
  ViewToggle,
} from "../../components/ui";
import { ago, money, moneyShort, today, whatsapp } from "../../lib/format";
import { meQuery } from "../../session";
import { CLIENT_TYPE_LABELS, label } from "../labels";
import { type ClientListItem, type ClientType, clientsQuery } from "./api";
import { useClientActions } from "./ClientActions";
import { ClientDialog } from "./ClientDialog";

const route = getRouteApi("/clients");

export function ClientsPage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const q = useDeferredValue(s.q ?? "");
  const list = useQuery(
    clientsQuery({
      q,
      type: s.type,
      sort: s.sort,
      archived: s.archived ? "1" : "0",
      rel: s.rel,
      owner: s.owner,
      followup: s.followup,
    }),
  );
  const [adding, setAdding] = useState(false);
  const me = useQuery(meQuery).data;
  const owner = !!me?.perms.includes("import.run");
  const manager = !!me?.perms.includes("clients.archive");
  const importLink = owner && (
    <Link
      to="/settings/import"
      className="inline-flex items-center gap-2 rounded-lg border bg-surface px-3.5 py-2 text-sm font-semibold transition hover:bg-brand-soft"
    >
      <FileUp className="size-4" /> استيراد من المنصة الحالية
    </Link>
  );
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const items = list.data?.items ?? [];
  const filtering = !!(q || s.type || s.rel || s.owner || s.followup);

  return (
    <>
      <PageHeader
        title={s.archived ? "العملاء المؤرشفون" : "العملاء"}
        subtitle={list.data ? `${total} عميل` : " "}
        actions={
          <>
            {importLink}
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> عميل جديد
            </Button>
          </>
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
          className="w-auto flex-1 sm:flex-none"
        >
          <option value="newest">الأحدث</option>
          <option value="name">الاسم</option>
          <option value="value">قيمة العقود</option>
          <option value="contact">الأقل تواصلاً</option>
        </Select>
        <Select
          aria-label="العلاقة"
          value={s.rel ?? ""}
          onChange={(e) => set({ rel: (e.target.value || undefined) as typeof s.rel })}
          className="w-auto flex-1 sm:flex-none"
        >
          <option value="">كل العلاقات</option>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABEL[r]}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={s.owner === "me"}
          onClick={() => set({ owner: s.owner === "me" ? undefined : "me" })}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm sm:min-h-9 ${s.owner === "me" ? "border-brand bg-brand-soft text-brand" : "text-muted"}`}
        >
          عملائي
        </button>
        <button
          type="button"
          aria-pressed={s.followup === "due"}
          onClick={() => set({ followup: s.followup === "due" ? undefined : "due" })}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm sm:min-h-9 ${s.followup === "due" ? "border-brand bg-brand-soft text-brand" : "text-muted"}`}
        >
          تحتاج متابعة
        </button>
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
          className="inline-flex min-h-11 items-center text-sm text-muted underline hover:text-ink sm:min-h-0"
        >
          {s.archived ? "عرض العملاء الحاليين" : "عرض المؤرشف"}
        </button>
      </div>

      {list.isPending ? (
        <SkeletonGrid className="h-56" label="جارٍ تحميل العملاء" />
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
            text="سجّلوا أول عميل ثم أضيفوا مشاريعه من صفحته، أو انقلوا عملاءكم من المنصة الحالية."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {importLink}
                <Button onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> عميل جديد
                </Button>
              </div>
            }
          />
        )
      ) : (s.view ?? "grid") === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <ClientCard key={c.id} c={c} manager={manager} />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <ClientTable items={items} />
          </div>
          {/* A wide table does not fit a phone: the same clients as cards. */}
          <div className="grid gap-4 md:hidden">
            {items.map((c) => (
              <ClientCard key={c.id} c={c} manager={manager} />
            ))}
          </div>
        </>
      )}
      <ClientDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function ClientCard({ c, manager }: { c: ClientListItem; manager: boolean }) {
  const { items, dialogs } = useClientActions({
    id: c.id,
    name: c.name,
    archived: !!c.archivedAt,
    manager,
    hasProjects: c.projectCount > 0,
  });
  const wa = whatsapp(c.phone);
  const chip =
    "relative z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted transition hover:border-brand hover:text-brand";
  return (
    <Card className="group relative flex h-full flex-col gap-4 transition hover:border-brand hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar name={c.name} logo={c.logoUrl} />
        <div className="min-w-0 flex-1">
          {/* The whole card opens the client; actions sit above this link. */}
          <Link
            to="/clients/$id"
            params={{ id: c.id }}
            className="block truncate font-semibold after:absolute after:inset-0 after:rounded-2xl group-hover:text-brand"
          >
            {c.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span dir="ltr">{c.code}</span>
            <Badge>{label(CLIENT_TYPE_LABELS, c.type)}</Badge>
            <Badge
              tone={
                c.relationship === "active"
                  ? "green"
                  : c.relationship === "prospect"
                    ? "blue"
                    : c.relationship === "dormant"
                      ? "amber"
                      : "gray"
              }
            >
              {RELATIONSHIP_LABEL[c.relationship]}
            </Badge>
          </p>
        </div>
        <div className="relative z-10">
          <Menu items={items} label={`إجراءات ${c.name}`} />
        </div>
      </div>

      {(c.city || c.phone || c.email) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {c.city && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <MapPin className="size-3.5" />
              {c.city}
            </span>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className={chip} aria-label={`اتصال ${c.phone}`}>
              <Phone className="size-3.5" /> <span dir="ltr">{c.phone}</span>
            </a>
          )}
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer noopener"
              className={chip}
              aria-label="واتساب"
            >
              <MessageCircle className="size-3.5" /> واتساب
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className={chip} aria-label={`بريد ${c.email}`}>
              <Mail className="size-3.5" /> بريد
            </a>
          )}
        </div>
      )}

      {c.recentProjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.recentProjects.map((p) => (
            <Link
              key={p.id}
              to="/projects/$id"
              params={{ id: p.id }}
              className="relative z-10 max-w-full truncate rounded-md bg-brand-soft px-2 py-0.5 text-xs text-brand hover:underline"
            >
              {p.name}
            </Link>
          ))}
          {c.projectCount > c.recentProjects.length && (
            <span className="px-1 text-xs text-muted">
              +{c.projectCount - c.recentProjects.length}
            </span>
          )}
        </div>
      )}

      {(c.openRequests > 0 || !!c.lateInstalments) && (
        <p className="flex flex-wrap gap-1.5 text-xs">
          {c.openRequests > 0 && (
            <Badge tone="blue">
              {c.openRequests} {c.openRequests === 1 ? "فرصة مفتوحة" : "فرص مفتوحة"}
            </Badge>
          )}
          {!!c.lateInstalments && (
            <Badge tone="red">
              {c.lateInstalments} {c.lateInstalments === 1 ? "دفعة متأخرة" : "دفعات متأخرة"}
            </Badge>
          )}
        </p>
      )}
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center">
        <Stat label="المشاريع" value={String(c.projectCount)} />
        <Stat label="قيمة العقود" value={c.projectValue > 0 ? moneyShort(c.projectValue) : "—"} />
        {c.owed !== null && c.owed !== undefined ? (
          <Stat label="المستحق عليه" value={c.owed > 0 ? moneyShort(c.owed) : "—"} />
        ) : (
          <Stat label="المستندات" value={String(c.documentsCount)} />
        )}
      </dl>
      <CrmLine c={c} />
      {dialogs}
    </Card>
  );
}

/** The CRM line of a card: who looks after the client, the last contact, and a follow-up that is due. */
function CrmLine({ c }: { c: ClientListItem }) {
  const state = followUpState(c.nextFollowUpAt, today());
  const due = state === "overdue" || state === "today";
  return (
    <div className="-mt-2 space-y-1 text-center text-xs text-muted">
      <p>
        {c.ownerName ? `المسؤول: ${c.ownerName} · ` : ""}
        {c.lastContactAt
          ? `آخر تواصل ${ago(c.lastContactAt)}`
          : c.lastActivity
            ? `آخر نشاط ${ago(c.lastActivity)}`
            : "لا تواصل بعد"}
      </p>
      {due && (
        <p className="font-semibold text-red-600">
          متابعة {FOLLOW_UP_LABEL[state]} · {c.nextFollowUpAt}
        </p>
      )}
      {c.tags.length > 0 && <p>{c.tags.map((t) => `#${t}`).join(" ")}</p>}
    </div>
  );
}

function Stat({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{l}</dt>
      <dd className="truncate text-sm font-semibold">{value}</dd>
    </div>
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
            <th className="p-3 font-medium">العلاقة</th>
            <th className="p-3 font-medium">آخر تواصل</th>
            <th className="p-3 font-medium">المدينة</th>
            <th className="p-3 font-medium">المشاريع</th>
            <th className="p-3 font-medium">قيمة العقود</th>
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
                  <Avatar name={c.name} logo={c.logoUrl} />
                  {c.name}
                </Link>
              </td>
              <td className="p-3 text-muted" dir="ltr">
                {c.code}
              </td>
              <td className="p-3">{label(CLIENT_TYPE_LABELS, c.type)}</td>
              <td className="p-3">{RELATIONSHIP_LABEL[c.relationship]}</td>
              <td className="p-3">{c.lastContactAt ? ago(c.lastContactAt) : "—"}</td>
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
