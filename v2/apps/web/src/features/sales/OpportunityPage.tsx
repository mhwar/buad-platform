import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  type ActivityType,
  daysInStage,
  FOLLOW_UP_LABEL,
  followUpState,
  STAGE_HINT,
  STAGE_LABEL,
  weightedValue,
} from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import {
  Calculator,
  Check,
  FileText,
  FolderPlus,
  Mail,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Printer,
  Trophy,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { StatTile } from "../../components/StatTile";
import { useTrackRecent } from "../../components/shell/useRecent";
import {
  Avatar,
  Badge,
  Button,
  Card,
  cx,
  Dialog,
  EmptyState,
  Field,
  Input,
  Menu,
  type MenuItem,
  Notice,
  Segmented,
  Select,
  Textarea,
} from "../../components/ui";
import { ago, day, sar, today, whatsapp } from "../../lib/format";
import { useCan } from "../../session";
import type { ProductRequest, RequestStatus } from "../products/products-api";
import { productsQuery } from "../products/products-api";
import { ConvertRequestDialog, PricingDialog } from "../products/RequestsInbox";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";
import { RecordMeetings } from "../workspace/RecordMeetings";
import { opportunityQuery, QUOTE_LABEL, type Quote } from "./api";
import { ConvertQuoteDialog } from "./ConvertQuoteDialog";
import { QuoteDialog } from "./QuoteDialog";
import { FollowUpDialog } from "./SalesPage";
import { ActivityTimeline } from "./Timeline";

const route = getRouteApi("/sales/$id");
const FUNNEL: RequestStatus[] = ["new", "contacted", "quoted", "negotiating", "won"];
const QUOTE_TONE = { draft: "gray", sent: "blue", accepted: "green", rejected: "red" } as const;
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
type Tab = "activity" | "quotes" | "details";

/**
 * One opportunity, followed to the close — laid out like the project page:
 *  header   — who, for what, and the actions people need most
 *  stepper  — the funnel; click a stage to move it (winning converts, losing asks why)
 *  strip    — value, weighted value, age and days in the stage
 *  main     — النشاط (log a contact, the timeline) · عروض الأسعار · التفاصيل
 *  aside    — how to reach them, the next follow-up with shortcuts, and the facts
 */
export function OpportunityPage() {
  const { id } = route.useParams();
  const can = useCan();
  const edit = can("sales.edit");
  const qc = useQueryClient();
  const q = useQuery(opportunityQuery(id));
  const people = useQuery(assigneesQuery);
  const products = useQuery({ ...productsQuery, enabled: edit });
  const o = q.data?.opportunity;
  useTrackRecent(
    o ? { kind: "opportunity", id, title: o.entity || o.name, href: `/sales/${id}` } : null,
  );
  const [tab, setTab] = useState<Tab>("activity");
  const [noting, setNoting] = useState(false);
  const [dialog, setDialog] = useState<
    | null
    | { kind: "follow" | "pricing" | "convert" | "lose" | "win" | "new-quote" }
    | { kind: "quote"; quote: Quote }
    | { kind: "convert-quote"; quote: Quote }
  >(null);
  const [error, setError] = useState("");

  if (q.isPending) return <Card className="h-64 animate-pulse" aria-busy />;
  if (q.isError || !q.data || !o)
    return (
      <EmptyState
        title="الفرصة غير موجودة"
        action={
          <Link to="/sales" className="text-brand underline">
            العودة إلى الفرص
          </Link>
        }
      />
    );

  const { client, quotes, activities } = q.data;
  const open = o.status !== "won" && o.status !== "lost";
  const nowS = Math.floor(Date.now() / 1000);
  const age = Math.max(0, Math.floor((nowS - o.createdAt) / 86400));
  const inStage = daysInStage(o, nowS);
  const fu = open ? followUpState(o.followUpAt, today()) : "none";
  const accepted = quotes.find((z) => z.status === "accepted" && !z.projectId);
  const wa = whatsapp(o.phone || client?.phone || "");
  const phone = o.phone || client?.phone || "";
  const email = o.email || client?.email || "";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["product-requests"] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["sales-overview"] });
    qc.invalidateQueries({ queryKey: ["attention"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
    if (client) qc.invalidateQueries({ queryKey: ["crm", client.id] });
  };
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch {
      setError("تعذّر الحفظ، حاول مرة أخرى.");
    }
  };
  const patch = (body: object) => run(() => send("PATCH", `/api/product-requests/${o.id}`, body));
  const moveTo = (s: RequestStatus) => {
    if (s === o.status) return;
    if (s === "won") return setDialog({ kind: "win" });
    if (s === "lost") return setDialog({ kind: "lose" });
    patch({ status: s });
  };
  const close = () => setDialog(null);
  const done = () => {
    close();
    refresh();
  };

  const menu: MenuItem[] = [
    { section: "الفرصة" },
    {
      label: "المسؤول والقيمة والمتابعة",
      icon: <Pencil />,
      onSelect: () => setDialog({ kind: "follow" }),
    },
    {
      label: "تسعير من الخدمة",
      hint: "من نموذج تكاليف الباقة",
      icon: <Calculator />,
      onSelect: () => setDialog({ kind: "pricing" }),
    },
    ...(open
      ? [
          "separator" as const,
          {
            label: "اكسب وحوّل إلى مشروع",
            icon: <Trophy />,
            onSelect: () => setDialog({ kind: "win" }),
          },
          {
            label: "أغلقها كخاسرة",
            icon: <XCircle />,
            danger: true,
            onSelect: () => setDialog({ kind: "lose" }),
          },
        ]
      : []),
  ];

  return (
    <>
      <nav aria-label="مسار التنقل" className="mb-3 text-sm text-muted">
        <Link to="/sales" className="hover:text-ink">
          الفرص
        </Link>
        {client && (
          <>
            {" / "}
            <Link to="/clients/$id" params={{ id: client.id }} className="hover:text-ink">
              {client.name}
            </Link>
          </>
        )}
      </nav>
      {error && <Notice>{error}</Notice>}

      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{o.entity || o.name}</h1>
            <Badge tone={o.status === "won" ? "green" : o.status === "lost" ? "gray" : "blue"}>
              {STAGE_LABEL[o.status]}
            </Badge>
            <Badge>{o.source === "site" ? "من الموقع" : "سُجّلت يدوياً"}</Badge>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {client ? (
              <Link
                to="/clients/$id"
                params={{ id: client.id }}
                className="inline-flex items-center gap-2 font-medium text-brand hover:underline"
              >
                <Avatar name={client.name} size="xs" />
                {client.name}
              </Link>
            ) : (
              <span>بلا عميل بعد — يُنشأ عند أول تواصل</span>
            )}
            {o.name && o.name !== (o.entity || client?.name) && <span>جهة الاتصال: {o.name}</span>}
            {o.productName && (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
                {o.productName}
                {o.packageName && ` · ${o.packageName}`}
              </span>
            )}
          </p>
        </div>
        {edit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setTab("activity");
                setNoting(true);
              }}
            >
              <NotebookPen className="size-4" />
              سجّل تواصلاً
            </Button>
            {open && (
              <Button onClick={() => setDialog({ kind: "new-quote" })}>
                <FileText className="size-4" />
                عرض سعر
              </Button>
            )}
            <Menu items={menu} label="إجراءات الفرصة" />
          </div>
        )}
      </header>

      <Stepper status={o.status} edit={edit && !o.projectId} onMove={moveTo} />
      {o.status === "lost" && o.lostReason && (
        <Notice tone="amber">سبب الخسارة: {o.lostReason}</Notice>
      )}
      {o.projectId && (
        <Notice tone="blue">
          تحوّلت هذه الفرصة إلى مشروع.{" "}
          <Link to="/projects/$id" params={{ id: o.projectId }} className="underline">
            فتح المشروع
          </Link>
        </Notice>
      )}

      <ul
        aria-label="أرقام الفرصة"
        className="my-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-slate-200 sm:grid-cols-4 dark:bg-slate-800"
      >
        <Fact label="القيمة المتوقعة" value={o.value ? sar(o.value) : "—"} />
        <Fact
          label="القيمة المرجّحة"
          value={open && o.value ? sar(weightedValue(o.status, o.value)) : "—"}
          hint={open ? "بحسب احتمال المرحلة" : undefined}
        />
        <Fact label="عمر الفرصة" value={`${age} يوم`} hint={`منذ ${day(isoOf(o.createdAt))}`} />
        <Fact
          label="في هذه المرحلة"
          value={open ? `${inStage} يوم` : "—"}
          tone={open && inStage >= 14 ? "warn" : undefined}
        />
      </ul>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Segmented<Tab>
            label="أقسام الفرصة"
            value={tab}
            onChange={setTab}
            items={[
              { value: "activity", label: "النشاط" },
              { value: "quotes", label: `عروض الأسعار (${quotes.length})` },
              { value: "details", label: "التفاصيل" },
            ]}
          />
          {tab === "activity" && (
            <section aria-label="النشاط" className="space-y-4">
              {/* Once closed, the log is a record: adding to it is one click away, not the first thing. */}
              {edit &&
                (open || noting ? (
                  <LogContact opportunity={o} onSaved={refresh} />
                ) : (
                  <Button variant="secondary" onClick={() => setNoting(true)}>
                    <NotebookPen className="size-4" />
                    إضافة ملاحظة أو تواصل
                  </Button>
                ))}
              {activities.length === 0 ? (
                <EmptyState
                  title="لا نشاط بعد"
                  text="سجّل أول اتصال أو رسالة: تظهر هنا مع تغيّر المراحل بترتيب زمني."
                />
              ) : (
                <ActivityTimeline
                  items={activities}
                  onDelete={
                    edit
                      ? (aid) => run(() => send("DELETE", `/api/crm/activities/${aid}`))
                      : undefined
                  }
                />
              )}
            </section>
          )}
          {tab === "quotes" && (
            <section aria-label="عروض الأسعار" className="space-y-3">
              {edit && open && (
                <div className="flex justify-end">
                  <Button onClick={() => setDialog({ kind: "new-quote" })}>عرض سعر جديد</Button>
                </div>
              )}
              {quotes.length === 0 && (
                <EmptyState
                  title="لا عروض لهذه الفرصة"
                  text="أنشئ عرضاً من بنود حرة أو من باقة، ثم أرسله ملف PDF."
                />
              )}
              <ul className="grid gap-3 md:grid-cols-2">
                {quotes.map((z) => (
                  <li key={z.id}>
                    <Card className="space-y-2 p-4">
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "quote", quote: z })}
                        className="block w-full space-y-1 text-start"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold" dir="ltr">
                            {z.number}
                          </span>
                          <span className="flex gap-1">
                            {z.expired && z.status !== "rejected" && <Badge tone="red">منتهٍ</Badge>}
                            <Badge tone={QUOTE_TONE[z.status]}>{QUOTE_LABEL[z.status]}</Badge>
                          </span>
                        </span>
                        <span className="block text-sm">{z.title}</span>
                        <span className="block text-base font-bold">{sar(z.totals.total)}</span>
                        <span className="block text-xs text-muted">
                          {z.validUntil ? `صالح حتى ${day(z.validUntil)}` : "بلا تاريخ صلاحية"}
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-2 border-t pt-2">
                        {edit && z.status === "accepted" && !z.projectId && (
                          <Button
                            variant="secondary"
                            onClick={() => setDialog({ kind: "convert-quote", quote: z })}
                          >
                            <FolderPlus className="size-4" />
                            تحويل إلى مشروع
                          </Button>
                        )}
                        <Link
                          to="/print/quotes/$id"
                          params={{ id: z.id }}
                          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink sm:min-h-9"
                        >
                          <Printer className="size-4" />
                          طباعة
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tab === "details" && <Details o={o} edit={edit} onSave={(notes) => patch({ notes })} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-label="تفاصيل الفرصة">
          <Card className="space-y-3">
            <h2 className="font-semibold">التواصل</h2>
            {o.name && <p className="text-sm">{o.name}</p>}
            <div className="flex flex-wrap gap-2 text-sm">
              {phone && (
                <a
                  href={`tel:${phone}`}
                  dir="ltr"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 hover:bg-brand-soft"
                >
                  <Phone className="size-3.5" /> {phone}
                </a>
              )}
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 hover:bg-brand-soft"
                >
                  <MessageCircle className="size-3.5" /> واتساب
                </a>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 hover:bg-brand-soft"
                >
                  <Mail className="size-3.5" /> بريد
                </a>
              )}
              {!phone && !email && <p className="text-muted">لا وسيلة تواصل مسجّلة.</p>}
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">المتابعة التالية</h2>
              {fu !== "none" && (
                <Badge tone={fu === "overdue" ? "red" : fu === "today" ? "amber" : "gray"}>
                  {FOLLOW_UP_LABEL[fu]}
                </Badge>
              )}
            </div>
            <p className={cx("text-lg font-bold", fu === "overdue" && "text-red-600")}>
              {o.followUpAt && open ? day(o.followUpAt) : "لم تُحدد"}
            </p>
            {edit && open && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  ["غداً", 1],
                  ["بعد 3 أيام", 3],
                  ["بعد أسبوع", 7],
                ].map(([l, n]) => (
                  <Button
                    key={l}
                    variant="secondary"
                    className="px-2.5 text-xs"
                    onClick={() => patch({ followUpAt: addDays(n as number) })}
                  >
                    {l}
                  </Button>
                ))}
                {o.followUpAt && (
                  <Button
                    variant="ghost"
                    className="px-2.5 text-xs"
                    onClick={() => patch({ followUpAt: "" })}
                  >
                    مسح
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">بيانات الفرصة</h2>
              {edit && (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => setDialog({ kind: "follow" })}
                >
                  <Pencil className="size-3.5" /> تعديل
                </Button>
              )}
            </div>
            <dl className="space-y-2.5 text-sm">
              <Row label="المسؤول">
                {edit ? (
                  <Select
                    aria-label="المسؤول"
                    value={o.ownerId}
                    onChange={(e) => patch({ ownerId: e.target.value })}
                    className="min-h-9 py-1"
                  >
                    <option value="">— غير محدد —</option>
                    {(people.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.email}
                      </option>
                    ))}
                  </Select>
                ) : (
                  o.ownerName || "—"
                )}
              </Row>
              <Row label="الخدمة">
                {o.productName
                  ? `${o.productName}${o.packageName ? ` · ${o.packageName}` : ""}`
                  : "—"}
              </Row>
              <Row label="المصدر">{o.source === "site" ? "طلب من الموقع" : "سُجّلت يدوياً"}</Row>
              <Row label="آخر حركة">{ago(o.updatedAt)}</Row>
            </dl>
          </Card>
          <RecordMeetings
            link={{ requestId: o.id, clientId: o.clientId }}
            title={`اجتماع مع ${o.entity || o.name}`}
          />
        </aside>
      </div>

      {dialog?.kind === "follow" && (
        <FollowUpDialog r={o} people={people.data ?? []} onClose={close} onSaved={done} />
      )}
      {dialog?.kind === "pricing" && (
        <PricingDialog r={o} products={products.data ?? []} onClose={close} onDone={refresh} />
      )}
      {dialog?.kind === "convert" && (
        <ConvertRequestDialog r={o} onClose={close} onDone={refresh} />
      )}
      {dialog?.kind === "new-quote" && (
        <QuoteDialog
          seed={{
            requestId: o.id,
            recipient: o.name,
            entity: o.entity || client?.name || "",
            title: o.productName ? `عرض سعر — ${o.productName}` : "عرض سعر",
            value: o.value,
          }}
          onClose={close}
          onSaved={() => {
            setTab("quotes");
            refresh();
          }}
        />
      )}
      {dialog?.kind === "quote" && (
        <QuoteDialog existing={dialog.quote} onClose={close} onSaved={refresh} />
      )}
      {dialog?.kind === "convert-quote" && (
        <ConvertQuoteDialog quote={dialog.quote} onClose={close} onDone={refresh} />
      )}
      {dialog?.kind === "win" && (
        <Dialog open onOpenChange={(v) => !v && close()} title="كسب الفرصة">
          <div className="space-y-3 text-sm">
            <p>مبروك! الخطوة التالية عادةً مشروع يبدأ منه التنفيذ والتحصيل.</p>
            {accepted ? (
              <Button
                className="w-full"
                onClick={() => setDialog({ kind: "convert-quote", quote: accepted })}
              >
                <FolderPlus className="size-4" />
                تحويل العرض المقبول {accepted.number} إلى مشروع
              </Button>
            ) : (
              <Button className="w-full" onClick={() => setDialog({ kind: "convert" })}>
                <FolderPlus className="size-4" />
                تحويل إلى مشروع
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                await patch({ status: "won" });
                close();
              }}
            >
              <Check className="size-4" />
              تعليمها كمكسوبة فقط
            </Button>
          </div>
        </Dialog>
      )}
      {dialog?.kind === "lose" && (
        <LoseDialog
          onClose={close}
          onSave={async (lostReason) => {
            await patch({ status: "lost", lostReason });
            close();
          }}
        />
      )}
    </>
  );
}

const isoOf = (epoch: number) => new Date(epoch * 1000).toISOString().slice(0, 10);

/** The funnel as steps: done ones ticked, the current one marked, «خاسر» set apart at the end. */
function Stepper({
  status,
  edit,
  onMove,
}: {
  status: RequestStatus;
  edit: boolean;
  onMove: (s: RequestStatus) => void;
}) {
  const at = FUNNEL.indexOf(status);
  const list = useRef<HTMLOListElement>(null);
  // On a phone the steps scroll: bring the current one into view.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [status]);
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <ol
        ref={list}
        aria-label="مراحل الفرصة"
        className="flex min-w-0 flex-1 overflow-x-auto rounded-xl border bg-surface p-1"
      >
        {FUNNEL.map((s, i) => {
          const current = s === status;
          const past = at >= 0 && i < at;
          return (
            <li key={s} className="min-w-[6.5rem] flex-1">
              <button
                type="button"
                disabled={!edit || current}
                title={STAGE_HINT[s]}
                aria-current={current ? "step" : undefined}
                onClick={() => onMove(s)}
                className={cx(
                  "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition disabled:cursor-default",
                  current
                    ? s === "won"
                      ? "bg-emerald-600 font-semibold text-white"
                      : "bg-brand font-semibold text-white dark:text-canvas"
                    : past
                      ? "text-brand hover:bg-brand-soft"
                      : "text-muted hover:bg-brand-soft hover:text-ink",
                )}
              >
                {past && <Check className="size-3.5" />}
                {STAGE_LABEL[s]}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={!edit || status === "lost"}
        title={STAGE_HINT.lost}
        aria-current={status === "lost" ? "step" : undefined}
        onClick={() => onMove("lost")}
        className={cx(
          "min-h-11 rounded-xl border px-4 text-sm transition disabled:cursor-default",
          status === "lost"
            ? "border-slate-400 bg-slate-500 font-semibold text-white"
            : "bg-surface text-muted hover:text-red-600",
        )}
      >
        {STAGE_LABEL.lost}
      </button>
    </div>
  );
}

function Fact(r: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return <StatTile {...r} as="cell" />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** «سجّل تواصلاً»: what kind, what was said, and when to follow up next — one short form. */
function LogContact({
  opportunity: o,
  onSaved,
}: {
  opportunity: ProductRequest;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ActivityType>("call");
  const [summary, setSummary] = useState("");
  const [follow, setFollow] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await send("POST", `/api/product-requests/${o.id}/activities`, {
        type,
        summary,
        ...(follow !== undefined ? { followUpAt: follow } : {}),
      });
      setSummary("");
      setFollow(undefined);
      onSaved();
    } catch {
      setError("تعذّر الحفظ، حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">سجّل تواصلاً</h2>
      {error && <Notice>{error}</Notice>}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="نوع التواصل">
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cx(
              "min-h-10 rounded-full border px-3 text-sm transition sm:min-h-8",
              type === t
                ? "border-brand bg-brand text-white dark:text-canvas"
                : "bg-surface text-muted hover:text-ink",
            )}
          >
            {ACTIVITY_LABEL[t]}
          </button>
        ))}
      </div>
      <Textarea
        rows={2}
        aria-label="ملخص التواصل"
        placeholder="ماذا قيل؟ ما الخطوة التالية؟"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">المتابعة التالية:</span>
        {(
          [
            ["كما هي", undefined],
            ["غداً", addDays(1)],
            ["بعد 3 أيام", addDays(3)],
            ["بعد أسبوع", addDays(7)],
          ] as const
        ).map(([l, v]) => (
          <button
            key={l}
            type="button"
            aria-pressed={follow === v}
            onClick={() => setFollow(v)}
            className={cx(
              "min-h-9 rounded-lg border px-2.5 text-xs",
              follow === v ? "border-brand bg-brand-soft text-brand" : "text-muted hover:text-ink",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {o.status === "new" && (
        <p className="text-xs text-muted">أول تواصل ينقل الفرصة إلى «مؤهَّل» ويربطها بعميلها.</p>
      )}
      <Button disabled={busy || !summary.trim()} onClick={save}>
        حفظ التواصل
      </Button>
    </Card>
  );
}

function Details({
  o,
  edit,
  onSave,
}: {
  o: ProductRequest;
  edit: boolean;
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(o.notes);
  const qs = o.quote as {
    packageName?: string;
    times?: number;
    price?: number;
    total?: number;
    profit?: number;
    marginPct?: number;
  };
  return (
    <section aria-label="التفاصيل" className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">ما طلبوه</h2>
        {o.message ? (
          <p className="whitespace-pre-wrap text-sm">{o.message}</p>
        ) : (
          <p className="text-sm text-muted">لا رسالة.</p>
        )}
        {Object.keys(o.answers).length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-canvas/60 p-3 text-sm sm:grid-cols-2">
            {Object.entries(o.answers).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      {typeof qs.price === "number" && (
        <Card className="space-y-1 text-sm">
          <h2 className="font-semibold">التسعير من الخدمة</h2>
          <p>
            {qs.packageName} × {qs.times}: السعر {sar(qs.price)} قبل الضريبة · الإجمالي{" "}
            {sar(qs.total ?? 0)}
          </p>
          <p className="text-xs text-muted">
            الربح {sar(qs.profit ?? 0)} ({qs.marginPct}%). أرقام داخلية لا تظهر للعميل.
          </p>
        </Card>
      )}
      <Card>
        <Field label="ملاحظات داخلية">
          <Textarea
            rows={4}
            value={notes}
            disabled={!edit}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== o.notes && onSave(notes)}
          />
        </Field>
      </Card>
    </section>
  );
}

function LoseDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const common = ["السعر", "اختاروا جهة أخرى", "أُجّل المشروع", "لا ميزانية", "لا رد"];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="إغلاق الفرصة كخاسرة">
      <div className="space-y-3">
        <p className="text-sm text-muted">السبب يساعدك على فهم ما يفوتك من فرص.</p>
        <div className="flex flex-wrap gap-1.5">
          {common.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={reason === c}
              onClick={() => setReason(c)}
              className={cx(
                "min-h-9 rounded-full border px-3 text-sm",
                reason === c
                  ? "border-brand bg-brand-soft text-brand"
                  : "text-muted hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Field label="السبب">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button className="w-full" disabled={!reason.trim()} onClick={() => onSave(reason.trim())}>
          إغلاق كخاسرة
        </Button>
      </div>
    </Dialog>
  );
}
