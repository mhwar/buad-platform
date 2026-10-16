import { DOC_KIND_LABELS, DOC_STATUS_LABELS } from "@buad/schema/documents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  Copy,
  FileSignature,
  FileText,
  FolderOpen,
  Inbox,
  LayoutList,
  Mail,
  Plus,
  Printer,
  ShoppingCart,
  Stamp,
  Table2,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import { FilterBar } from "../../components/FilterBar";
import {
  Avatar,
  Badge,
  Button,
  Card,
  cx,
  Dialog,
  EmptyState,
  Menu,
  type MenuItem,
  Notice,
  PageHeader,
  Pills,
  SearchBox,
  Segmented,
  type Tone,
} from "../../components/ui";
import { fromEpoch, sar } from "../../lib/format";
import { useCan } from "../../session";
import { QUOTE_LABEL, type Quote, quotesQuery } from "../sales/api";
import { QuoteDialog } from "../sales/QuoteDialog";
import { send } from "../team/queries";
import { type RegisterItem, registerQuery, waitingLabel } from "./api";
import { useDocumentActions } from "./DocumentActions";
import { NewDocumentDialog, STATUS_TONE } from "./DocumentsSection";

const route = getRouteApi("/documents");
type Kind = "contract" | "letter" | "quote";
type View = "all" | "outgoing";
type Layout = "list" | "table";
const LAYOUT_KEY = "buad-documents-layout";
const readLayout = (): Layout => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "table" ? "table" : "list";
  } catch {
    return "list";
  }
};
const QUOTE_TONE: Record<Quote["status"], Tone> = {
  draft: "gray",
  sent: "blue",
  accepted: "green",
  rejected: "red",
};
/** One status vocabulary across kinds, for the filter: «صادر» means it has an outgoing number. */
const STATUSES = [
  { value: "draft", label: "مسودة" },
  { value: "review", label: "قيد المراجعة" },
  { value: "approved", label: "معتمد" },
  { value: "outgoing", label: "صادر برقم" },
  { value: "sent", label: "عرض أُرسل" },
  { value: "accepted", label: "عرض مقبول" },
  { value: "rejected", label: "عرض مرفوض" },
] as const;
const PERIODS = [
  { value: "30", label: "آخر 30 يوماً" },
  { value: "90", label: "آخر 3 أشهر" },
  { value: "year", label: "هذه السنة" },
];

/** A contract, letter or quote, shaped for one register. */
type Entry = {
  key: string;
  kind: Kind;
  title: string;
  number: string;
  outgoingNo: string;
  status: string;
  statusLabel: string;
  tone: Tone;
  clientId: string;
  clientName: string;
  clientLogo: string;
  projectId: string;
  projectName: string;
  amount: number | null;
  updatedAt: number;
  date: number;
  /** In review: how long it has waited for approval. */
  waiting?: string;
  open: () => void;
  menu: MenuItem[];
};

/**
 * «المستندات»: every contract, letter and quote of the organisation in one register — drafts and
 * issued alike — with search, filters, a list or a table, the outgoing (صادر) ledger, and «+ مستند».
 */
export function DocumentsPage() {
  const s = route.useSearch();
  const nav = route.useNavigate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const set = (patch: Partial<typeof s>) =>
    nav({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const can = useCan();
  const seesQuotes = can("sales.view");
  const editDocs = can("documents.edit");
  const editQuotes = can("sales.edit");
  const q = useDeferredValue(s.q ?? "");
  const outgoing = s.view === "outgoing";
  const actions = useDocumentActions(editDocs);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [creating, setCreating] = useState<null | "pick" | "doc" | "quote">(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const setLayout = (v: Layout) => {
    setLayoutState(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  };
  const reg = useQuery(registerQuery({ q: q || undefined, outgoing: outgoing ? "1" : undefined }));
  const quotes = useQuery({ ...quotesQuery, enabled: seesQuotes && !outgoing });

  const docEntry = (d: RegisterItem): Entry => ({
    key: `d-${d.id}`,
    kind: d.kind,
    title: d.title || (DOC_KIND_LABELS[d.kind] ?? ""),
    number: d.number,
    outgoingNo: d.outgoingNo,
    status: d.status,
    statusLabel: DOC_STATUS_LABELS[d.status] ?? d.status,
    tone: STATUS_TONE[d.status] ?? "gray",
    clientId: d.clientId,
    clientName: d.clientName,
    clientLogo: d.clientLogo,
    projectId: d.projectId,
    projectName: d.projectName,
    amount: null,
    updatedAt: d.updatedAt,
    date: outgoing ? (d.outgoingAt ?? d.updatedAt) : d.updatedAt,
    waiting: waitingLabel(d),
    open: () =>
      navigate({ to: "/projects/$id/documents/$docId", params: { id: d.projectId, docId: d.id } }),
    menu: actions.items(d),
  });
  const quoteEntry = (z: Quote): Entry => ({
    key: `q-${z.id}`,
    kind: "quote",
    title: z.title,
    number: z.number,
    outgoingNo: "",
    status: z.status,
    statusLabel: z.expired && z.status === "sent" ? "منتهٍ" : QUOTE_LABEL[z.status],
    tone: z.expired && z.status === "sent" ? "red" : QUOTE_TONE[z.status],
    clientId: z.clientId,
    clientName: z.entity || z.recipient,
    clientLogo: "",
    projectId: z.projectId,
    projectName: "",
    amount: z.totals.total,
    updatedAt: z.updatedAt,
    date: z.updatedAt,
    open: () => setQuote(z),
    menu: [
      { label: "فتح", icon: <FolderOpen />, onSelect: () => setQuote(z) },
      {
        label: "طباعة / PDF",
        icon: <Printer />,
        onSelect: () => navigate({ to: "/print/quotes/$id", params: { id: z.id } }),
      },
      ...(editQuotes
        ? [
            {
              label: "نسخة جديدة",
              hint: "مسودة برقم جديد",
              icon: <Copy />,
              onSelect: async () => {
                await send("POST", `/api/quotes/${z.id}/duplicate`);
                qc.invalidateQueries({ queryKey: ["quotes"] });
              },
            },
          ]
        : []),
      ...(z.requestId
        ? [
            {
              label: "فتح الفرصة",
              icon: <ShoppingCart />,
              onSelect: () => navigate({ to: "/sales/$id", params: { id: z.requestId } }),
            },
          ]
        : []),
    ],
  });

  const needle = q.trim().toLowerCase();
  const all: Entry[] = [
    ...(reg.data?.items ?? []).map(docEntry),
    ...(outgoing ? [] : (quotes.data ?? []))
      .filter(
        (z) =>
          !needle ||
          `${z.title} ${z.number} ${z.recipient} ${z.entity}`.toLowerCase().includes(needle),
      )
      .map(quoteEntry),
  ];
  const nowS = Math.floor(Date.now() / 1000);
  const since =
    s.period === "30"
      ? nowS - 30 * 86400
      : s.period === "90"
        ? nowS - 90 * 86400
        : s.period === "year"
          ? Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000
          : 0;
  const matchStatus = (e: Entry) =>
    !s.status || (s.status === "outgoing" ? !!e.outgoingNo : e.status === s.status);
  const base = all.filter(
    (e) =>
      matchStatus(e) && (!s.client || e.clientName === s.client) && (!since || e.date >= since),
  );
  const shown = base.filter((e) => !s.kind || e.kind === s.kind).sort((a, b) => b.date - a.date);
  const countOf = (k: Kind) => base.filter((e) => e.kind === k).length;
  const clients = [...new Set(all.map((e) => e.clientName).filter(Boolean))].sort();
  const drafts = all.filter((e) => e.status === "draft").length;
  const filtering = !!(q || s.kind || s.status || s.client || s.period);
  const canCreate = editDocs || editQuotes;
  const loading = reg.isPending || (seesQuotes && !outgoing && quotes.isPending);

  return (
    <>
      <PageHeader
        title="المستندات"
        subtitle={
          reg.data
            ? `${all.length} مستند · ${drafts} مسودة · ${reg.data.outgoingCount} في سجل الصادر`
            : " "
        }
        actions={
          canCreate && (
            <Button
              onClick={() =>
                setCreating(editDocs && editQuotes ? "pick" : editDocs ? "doc" : "quote")
              }
            >
              <Plus className="size-4" /> مستند
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <Segmented<View>
          label="السجل"
          value={outgoing ? "outgoing" : "all"}
          onChange={(v) => set({ view: v === "outgoing" ? "outgoing" : undefined })}
          items={[
            { value: "all", label: "كل المستندات", icon: <Inbox className="size-4" /> },
            { value: "outgoing", label: "سجل الصادر", icon: <Stamp className="size-4" /> },
          ]}
        />
        <Segmented<Layout>
          label="طريقة العرض"
          value={layout}
          onChange={setLayout}
          items={[
            { value: "list", label: "قائمة", icon: <LayoutList className="size-4" /> },
            { value: "table", label: "جدول", icon: <Table2 className="size-4" /> },
          ]}
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox
          value={s.q ?? ""}
          onChange={(v) => set({ q: v || undefined })}
          placeholder="ابحث بالعنوان أو الرقم أو رقم الصادر أو المشروع أو العميل"
        />
      </div>
      <div className="mb-3">
        <FilterBar
          onChange={(k, v) => set({ [k]: v || undefined })}
          fields={[
            {
              key: "status",
              label: "الحالة",
              allLabel: "كل الحالات",
              value: s.status ?? "",
              options: STATUSES.filter(
                (x) => seesQuotes || !["sent", "accepted", "rejected"].includes(x.value),
              ).map((x) => ({ ...x })),
            },
            {
              key: "client",
              label: "العميل",
              allLabel: "كل العملاء",
              value: s.client ?? "",
              options: clients.map((c) => ({ value: c, label: c })),
            },
            {
              key: "period",
              label: "الفترة",
              allLabel: "كل الأوقات",
              value: s.period ?? "",
              options: PERIODS,
            },
          ]}
        />
      </div>
      <div className="mb-5">
        <Pills<Kind>
          value={s.kind ?? ""}
          onChange={(v) => set({ kind: v || undefined })}
          items={[
            { value: "", label: "الكل", count: base.length },
            { value: "contract", label: "العقود", count: countOf("contract") },
            { value: "letter", label: "الخطابات", count: countOf("letter") },
            ...(seesQuotes && !outgoing
              ? [{ value: "quote" as const, label: "عروض الأسعار", count: countOf("quote") }]
              : []),
          ]}
        />
      </div>

      {actions.dialog}
      {actions.busy && <Notice tone="blue">جارٍ {actions.busy}…</Notice>}
      {actions.error && <Notice>{actions.error}</Notice>}
      {loading ? (
        <Card className="h-40 animate-pulse" aria-busy />
      ) : reg.isError ? (
        <EmptyState
          title="تعذّر تحميل المستندات"
          action={<Button onClick={() => reg.refetch()}>إعادة المحاولة</Button>}
        />
      ) : shown.length === 0 ? (
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
            text="العقود والخطابات تُنشأ من مشاريعها وتُعبّأ تلقائياً، وعروض الأسعار من الفرص."
            action={
              canCreate ? (
                <Button
                  onClick={() =>
                    setCreating(editDocs && editQuotes ? "pick" : editDocs ? "doc" : "quote")
                  }
                >
                  مستند جديد
                </Button>
              ) : undefined
            }
          />
        )
      ) : layout === "table" ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b bg-canvas/60 text-right text-xs text-muted">
              <tr>
                {outgoing && <th className="p-3 font-medium">رقم الصادر</th>}
                <th className="p-3 font-medium">المستند</th>
                <th className="p-3 font-medium">النوع</th>
                <th className="p-3 font-medium">العميل</th>
                <th className="p-3 font-medium">المشروع</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">المبلغ</th>
                <th className="p-3 font-medium">{outgoing ? "تاريخ الصادر" : "آخر تعديل"}</th>
                <th className="p-3">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.key} className="border-b last:border-0 hover:bg-brand-soft/50">
                  {outgoing && (
                    <td className="p-3 font-semibold whitespace-nowrap text-brand">
                      {e.outgoingNo}
                    </td>
                  )}
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={e.open}
                      className="text-start font-semibold hover:text-brand hover:underline"
                    >
                      {e.title}
                    </button>
                    <span className="block text-xs text-muted" dir="ltr">
                      {e.number}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">{KIND_LABEL[e.kind]}</td>
                  <td className="p-3">
                    <Client e={e} />
                  </td>
                  <td className="p-3">
                    <ProjectLink e={e} />
                  </td>
                  <td className="p-3">
                    <Badge tone={e.tone}>{e.statusLabel}</Badge>
                    {e.waiting && (
                      <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                        {e.waiting}
                      </span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap tabular-nums">
                    {e.amount === null ? "—" : sar(e.amount)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-muted">{fromEpoch(e.date)}</td>
                  <td className="p-2">
                    <Menu items={e.menu} label={`إجراءات ${e.title}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <li key={e.key}>
              <Card className="relative flex h-full items-start gap-3 p-4">
                <KindIcon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={e.open}
                    className="block w-full truncate text-start font-semibold after:absolute after:inset-0 after:rounded-2xl"
                  >
                    {e.title}
                  </button>
                  <p className="truncate text-xs text-muted">
                    {[KIND_LABEL[e.kind], e.clientName, e.projectName].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {e.outgoingNo && (
                      <span className="font-semibold text-brand">{e.outgoingNo}</span>
                    )}
                    <span dir="ltr">{e.number}</span>
                    <span>{fromEpoch(e.date)}</span>
                    {e.amount !== null && (
                      <span className="font-semibold text-ink">{sar(e.amount)}</span>
                    )}
                  </p>
                  {e.waiting && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      {e.waiting}
                    </p>
                  )}
                </div>
                <div className="relative z-10 flex flex-col items-end gap-2">
                  <Badge tone={e.tone}>{e.statusLabel}</Badge>
                  <Menu items={e.menu} label={`إجراءات ${e.title}`} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {creating === "pick" && (
        <Dialog open onOpenChange={(v) => !v && setCreating(null)} title="مستند جديد">
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice
              icon={<FileSignature className="size-5" />}
              title="عقد أو خطاب"
              text="من قوالب الجهة، يُعبّأ من بيانات المشروع"
              onClick={() => setCreating("doc")}
            />
            <Choice
              icon={<FileText className="size-5" />}
              title="عرض سعر"
              text="بنود حرة أو من باقة، ويُطبع PDF"
              onClick={() => setCreating("quote")}
            />
          </div>
        </Dialog>
      )}
      {creating === "doc" && <NewDocumentDialog onClose={() => setCreating(null)} />}
      {creating === "quote" && (
        <QuoteDialog
          onClose={() => setCreating(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["quotes"] })}
        />
      )}
      {quote && (
        <QuoteDialog
          existing={quote}
          onClose={() => setQuote(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["quotes"] })}
        />
      )}
    </>
  );
}

const KIND_LABEL: Record<Kind, string> = {
  contract: DOC_KIND_LABELS.contract ?? "عقد",
  letter: DOC_KIND_LABELS.letter ?? "خطاب",
  quote: "عرض سعر",
};

function KindIcon({ kind }: { kind: Kind }) {
  const Icon = kind === "contract" ? FileSignature : kind === "letter" ? Mail : FileText;
  return (
    <span
      className={cx(
        "grid size-9 shrink-0 place-items-center rounded-lg",
        kind === "quote"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-brand-soft text-brand",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function Client({ e }: { e: Entry }) {
  if (!e.clientName) return <span className="text-muted">—</span>;
  const inner = (
    <>
      <Avatar name={e.clientName} logo={e.clientLogo} size="xs" />
      {e.clientName}
    </>
  );
  return e.clientId ? (
    <Link
      to="/clients/$id"
      params={{ id: e.clientId }}
      className="flex items-center gap-2 hover:text-brand"
    >
      {inner}
    </Link>
  ) : (
    <span className="flex items-center gap-2">{inner}</span>
  );
}

function ProjectLink({ e }: { e: Entry }) {
  if (!e.projectId) return <span className="text-muted">—</span>;
  return (
    <Link
      to="/projects/$id"
      params={{ id: e.projectId }}
      search={e.kind === "quote" ? {} : { view: "documents" }}
      className="hover:text-brand"
    >
      {e.projectName || "فتح المشروع"}
    </Link>
  );
}

function Choice({
  icon,
  title,
  text,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border p-4 text-start transition hover:border-brand hover:bg-brand-soft/50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}
