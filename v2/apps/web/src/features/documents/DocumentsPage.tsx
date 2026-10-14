import { DOC_KIND_LABELS, DOC_STATUS_LABELS } from "@buad/schema/documents";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { FileSignature, Inbox, Mail, Stamp } from "lucide-react";
import { useDeferredValue } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pills,
  SearchBox,
  Segmented,
  Select,
} from "../../components/ui";
import { fromEpoch } from "../../lib/format";
import { type DocStatus, type RegisterItem, registerQuery } from "./api";
import { STATUS_TONE } from "./DocumentsSection";

const route = getRouteApi("/documents");
type Kind = "contract" | "letter";
type View = "all" | "outgoing";

/** «المستندات»: every contract and letter of the organisation, and the outgoing (صادر) ledger. */
export function DocumentsPage() {
  const s = route.useSearch();
  const navigate = route.useNavigate();
  const set = (patch: Partial<typeof s>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const q = useDeferredValue(s.q ?? "");
  const outgoing = s.view === "outgoing";
  const reg = useQuery(
    registerQuery({
      q: q || undefined,
      kind: s.kind,
      status: outgoing ? undefined : s.status,
      outgoing: outgoing ? "1" : undefined,
    }),
  );
  const counts = reg.data?.counts ?? [];
  const byKind = (k: Kind) => counts.filter((c) => c.kind === k).reduce((a, c) => a + c.n, 0);
  const total = counts.reduce((a, c) => a + c.n, 0);
  const items = reg.data?.items ?? [];
  const filtering = !!(q || s.kind || s.status);

  return (
    <>
      <PageHeader
        title="المستندات"
        subtitle={reg.data ? `${total} مستند · ${reg.data.outgoingCount} في سجل الصادر` : " "}
      />
      <div className="mb-4 max-w-md">
        <Segmented<View>
          label="العرض"
          value={outgoing ? "outgoing" : "all"}
          onChange={(v) => set({ view: v === "outgoing" ? "outgoing" : undefined })}
          items={[
            { value: "all", label: "كل المستندات", icon: <Inbox className="size-4" /> },
            { value: "outgoing", label: "سجل الصادر", icon: <Stamp className="size-4" /> },
          ]}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          value={s.q ?? ""}
          onChange={(v) => set({ q: v || undefined })}
          placeholder="ابحث بالعنوان أو الرقم أو رقم الصادر أو المشروع أو العميل"
        />
        {!outgoing && (
          <Select
            aria-label="الحالة"
            value={s.status ?? ""}
            onChange={(e) => set({ status: (e.target.value || undefined) as DocStatus })}
            className="w-auto"
          >
            <option value="">كل الحالات</option>
            {(["draft", "review", "approved"] as const).map((k) => (
              <option key={k} value={k}>
                {DOC_STATUS_LABELS[k]}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div className="mb-6">
        <Pills<Kind>
          value={s.kind ?? ""}
          onChange={(v) => set({ kind: v || undefined })}
          items={[
            { value: "", label: "الكل", count: total },
            { value: "contract", label: "العقود", count: byKind("contract") },
            { value: "letter", label: "الخطابات", count: byKind("letter") },
          ]}
        />
      </div>

      {reg.isPending ? (
        <p className="text-muted">جارٍ التحميل…</p>
      ) : reg.isError ? (
        <EmptyState
          title="تعذّر تحميل المستندات"
          action={<Button onClick={() => reg.refetch()}>إعادة المحاولة</Button>}
        />
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState title="لا نتائج" text="جرّبوا كلمة بحث أخرى أو أزيلوا عامل التصفية." />
        ) : outgoing ? (
          <EmptyState
            title="سجل الصادر فارغ"
            text="بعد اعتماد عقد أو خطاب، اضغطوا «تسجيل صادر» في صفحته ليأخذ رقماً من هذا السجل."
          />
        ) : (
          <EmptyState
            title="لا توجد مستندات بعد"
            text="أنشئوا العقود والخطابات من قسم «المستندات» في صفحة كل مشروع."
          />
        )
      ) : (
        <>
          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-right text-xs text-muted">
                <tr>
                  {outgoing && <th className="p-3 font-medium">رقم الصادر</th>}
                  <th className="p-3 font-medium">المستند</th>
                  <th className="p-3 font-medium">المشروع</th>
                  <th className="p-3 font-medium">العميل</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">{outgoing ? "تاريخ الصادر" : "آخر تعديل"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <Row key={d.id} d={d} outgoing={outgoing} />
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {items.map((d) => (
              <li key={d.id}>
                <MobileCard d={d} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
      {kind === "contract" ? <FileSignature className="size-4" /> : <Mail className="size-4" />}
    </span>
  );
}

const docLink = (d: RegisterItem) =>
  ({ to: "/projects/$id/documents/$docId", params: { id: d.projectId, docId: d.id } }) as const;

function Row({ d, outgoing }: { d: RegisterItem; outgoing: boolean }) {
  return (
    <tr className="border-b last:border-0 hover:bg-brand-soft/50">
      {outgoing && (
        <td className="p-3 font-semibold whitespace-nowrap text-brand">{d.outgoingNo}</td>
      )}
      <td className="p-3">
        <Link {...docLink(d)} className="flex items-center gap-2.5 hover:text-brand">
          <KindIcon kind={d.kind} />
          <span className="min-w-0">
            <span className="block font-semibold">{d.title || DOC_KIND_LABELS[d.kind]}</span>
            <span className="text-xs text-muted">
              {DOC_KIND_LABELS[d.kind]} · <span dir="ltr">{d.number}</span>
              {!outgoing && d.outgoingNo && (
                <>
                  {" "}
                  · صادر <span dir="rtl">{d.outgoingNo}</span>
                </>
              )}
            </span>
          </span>
        </Link>
      </td>
      <td className="p-3">
        <Link
          to="/projects/$id"
          params={{ id: d.projectId }}
          search={{ view: "documents" }}
          className="hover:text-brand"
        >
          {d.projectName}
          <span className="block text-xs text-muted" dir="ltr">
            {d.projectNumber}
          </span>
        </Link>
      </td>
      <td className="p-3">
        <Link
          to="/clients/$id"
          params={{ id: d.clientId }}
          className="flex items-center gap-2 hover:text-brand"
        >
          <Avatar name={d.clientName} logo={d.clientLogo} size="xs" />
          {d.clientName}
        </Link>
      </td>
      <td className="p-3">
        <Badge tone={STATUS_TONE[d.status]}>{DOC_STATUS_LABELS[d.status]}</Badge>
      </td>
      <td className="p-3 whitespace-nowrap text-muted">
        {fromEpoch(outgoing ? d.outgoingAt : d.updatedAt)}
      </td>
    </tr>
  );
}

function MobileCard({ d }: { d: RegisterItem }) {
  return (
    <Link {...docLink(d)} className="block">
      <Card className="flex items-start gap-3 p-4">
        <KindIcon kind={d.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{d.title || DOC_KIND_LABELS[d.kind]}</p>
          <p className="truncate text-xs text-muted">
            {d.projectName} · {d.clientName}
          </p>
          <p className="mt-1 text-xs text-muted">
            {d.outgoingNo && <span className="font-semibold text-brand">{d.outgoingNo} · </span>}
            <span dir="ltr">{d.number}</span>
          </p>
        </div>
        <Badge tone={STATUS_TONE[d.status]}>{DOC_STATUS_LABELS[d.status]}</Badge>
      </Card>
    </Link>
  );
}
