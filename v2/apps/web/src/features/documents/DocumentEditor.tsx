import {
  CLAUSE_LIBRARY,
  CONTRACT_TEMPLATES,
  formatGregorian,
  numberToArabicWords,
  type Resolved,
  toHijri,
} from "@buad/domain";
import {
  type Clause,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type DocLayout,
  type DocumentPatch,
} from "@buad/schema/documents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FileDown,
  FileText,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Share2,
  Stamp,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrackRecent } from "../../components/shell/useRecent";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Menu,
  type MenuItem,
  Notice,
  Segmented,
  Select,
  Textarea,
} from "../../components/ui";
import { ApiError, fromEpoch } from "../../lib/format";
import { meQuery } from "../../session";
import { type DocDetail, docApi, docKeys, documentQuery } from "./api";
import { exportPdf, exportWord } from "./DocumentActions";
import { STATUS_TONE } from "./DocumentsSection";
import { DocumentView, VAR_LABELS } from "./DocumentView";
import { FitToWidth } from "./FitToWidth";
import { SendDialog } from "./SendDialog";

const route = getRouteApi("/projects/$id/documents/$docId");
type Panel = "data" | "content" | "format";
type Draft = Pick<DocDetail["document"], "title" | "number" | "variables" | "content" | "layout">;

const CONTRACT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "العقد",
    keys: [
      "contract_no",
      "contract_date_gregorian",
      "contract_date_hijri",
      "contract_city",
      "signature_city",
      "subject",
    ],
  },
  {
    title: "القيمة والمدة",
    keys: ["contract_amount", "currency", "payment_method", "duration_months", "duration_unit"],
  },
  {
    title: "الطرف الأول (الجهة)",
    keys: [
      "party_a_name",
      "party_a_rep_name",
      "party_a_title",
      "party_a_id",
      "party_a_reg",
      "party_a_tax",
      "party_a_address",
      "party_a_phone",
      "party_a_email",
    ],
  },
  {
    title: "الطرف الثاني (العميل)",
    keys: [
      "party_b_name",
      "party_b_rep_name",
      "party_b_title",
      "party_b_id",
      "party_b_reg",
      "party_b_tax",
      "party_b_address",
      "party_b_phone",
      "party_b_email",
    ],
  },
];
const LETTER_GROUPS: typeof CONTRACT_GROUPS = [
  { title: "المرسل إليه", keys: ["letter_to_honorific", "letter_to", "letter_to_suffix"] },
  { title: "الخطاب", keys: ["letter_date", "letter_salutation", "letter_closing"] },
];
const SOURCE_LABEL: Record<string, string> = {
  org: "من بيانات الجهة",
  client: "من بيانات العميل",
  project: "من المشروع",
  finance: "من المالية",
  default: "افتراضي",
};
const DATE_KEYS = new Set(["contract_date_gregorian", "letter_date"]);

/** Live preview values: the server's resolution, with the user's unsaved edits and their dependants. */
function liveValues(server: Resolved, vars: Record<string, string>): Resolved {
  const out: Resolved = { ...server };
  for (const [k, v] of Object.entries(vars)) out[k] = { value: v, source: "manual" };
  const amount = Number.parseFloat((vars.contract_amount ?? "").replace(/,/g, ""));
  out.contract_amount_words = {
    value: Number.isFinite(amount) ? numberToArabicWords(amount) : "",
    source: "computed",
  };
  const dv = (vars.duration_months ?? "").trim();
  out.duration_full = {
    value: dv ? `${dv} ${(vars.duration_unit || "شهر").trim()}` : "",
    source: "computed",
  };
  out.contract_date_gregorian = {
    value: formatGregorian(vars.contract_date_gregorian ?? ""),
    source: "manual",
  };
  out.contract_date_hijri = {
    value: vars.contract_date_hijri?.trim() || toHijri(vars.contract_date_gregorian ?? ""),
    source: "computed",
  };
  if (vars.letter_date)
    out.letter_date_hijri = { value: toHijri(vars.letter_date), source: "computed" };
  return out;
}

export function DocumentEditor() {
  const { id: projectId, docId } = route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery).data;
  const q = useQuery(documentQuery(docId));
  useTrackRecent(
    q.data
      ? {
          kind: "document",
          id: docId,
          title: q.data.document.title || q.data.document.number,
          href: `/projects/${projectId}/documents/${docId}`,
        }
      : null,
  );
  const manager = !!me?.perms.includes("documents.edit");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<Panel>("data");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved">("idle");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "red" | "amber" | "blue"; text: string } | null>(
    null,
  );
  const pending = useRef<DocumentPatch | null>(null);
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (q.data && !pending.current) {
      const d = q.data.document;
      setDraft({
        title: d.title,
        number: d.number,
        variables: d.variables,
        content: d.content,
        layout: d.layout,
      });
      version.current = d.version;
    }
  }, [q.data]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = async () => {
    const patch = pending.current;
    if (!patch) return;
    pending.current = null;
    setSaveState("saving");
    try {
      const res = await docApi.patch(docId, { ...patch, version: version.current });
      version.current = res.document.version;
      qc.setQueryData(docKeys.detail(docId), res);
      setSaveState(pending.current ? "pending" : "saved");
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setNotice({
        tone: code === "stale" ? "amber" : "red",
        text:
          code === "stale"
            ? "عدّل مستخدم آخر المستند للتو، فعُرضت أحدث نسخة."
            : code === "number_taken"
              ? "رقم المستند مستخدم لمستند آخر."
              : code === "approved_locked"
                ? "المستند معتمد ومقفل."
                : "تعذّر الحفظ",
      });
      pending.current = null;
      await qc.invalidateQueries({ queryKey: docKeys.detail(docId) });
      setSaveState("idle");
    }
  };

  const change = (patch: Omit<DocumentPatch, "version">, next: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...next } : d));
    const p = pending.current ?? { version: 0 };
    pending.current = {
      ...p,
      ...patch,
      variables: patch.variables ? { ...(p.variables ?? {}), ...patch.variables } : p.variables,
      layout: patch.layout ? { ...(p.layout ?? {}), ...patch.layout } : p.layout,
    };
    setNotice(null);
    setSaveState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  const values = useMemo(
    () => (q.data && draft ? liveValues(q.data.values, draft.variables) : {}),
    [q.data, draft],
  );

  if (q.isPending || !draft)
    return (
      <div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" aria-busy />
    );
  if (q.isError || !q.data) return <Notice>المستند غير موجود</Notice>;
  const { document: doc, auto, org, versions, project } = q.data;
  const outgoingRef = doc.outgoingNo ? `${doc.outgoingNo} / ${project.number}` : "";
  const locked = doc.status === "approved" || !manager;

  const setVar = (k: string, value: string) =>
    change({ variables: { [k]: value } }, { variables: { ...draft.variables, [k]: value } });
  const setContent = (content: Clause[]) => change({ content }, { content });
  const setLayout = (l: Partial<DocLayout>) =>
    change({ layout: l }, { layout: { ...draft.layout, ...l } });

  const moveStatus = async (to: "draft" | "review" | "approved") => {
    if (to === "approved" && !confirm("اعتماد المستند يقفله عن التعديل ويحفظ نسخة منه. متابعة؟"))
      return;
    clearTimeout(timer.current);
    await flush();
    try {
      const res = await docApi.status(docId, to, version.current);
      version.current = res.document.version;
      qc.setQueryData(docKeys.detail(docId), res);
      await qc.invalidateQueries({ queryKey: docKeys.list(projectId) });
    } catch {
      setNotice({ tone: "red", text: "تعذّر تغيير الحالة" });
    }
  };
  const registerOutgoing = async () => {
    if (
      !confirm(
        "سيُعطى المستند رقم صادر من سجل الجهة، ويظهر في المطبوع. الرقم نهائي ولا يُعاد استخدامه. متابعة؟",
      )
    )
      return;
    try {
      await docApi.outgoing(docId);
      await qc.invalidateQueries({ queryKey: docKeys.detail(docId) });
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch {
      setNotice({ tone: "red", text: "تعذّر تسجيل الصادر" });
    }
  };
  const print = async () => {
    clearTimeout(timer.current);
    await flush();
    window.print();
  };

  const download = async (kind: "pdf" | "word") => {
    clearTimeout(timer.current);
    await flush();
    const fresh = qc.getQueryData<DocDetail>(docKeys.detail(docId)) ?? q.data;
    if (!fresh) return;
    setNotice({ tone: "blue", text: "جارٍ تجهيز الملف…" });
    try {
      const got = kind === "pdf" ? await exportPdf(fresh) : await exportWord(fresh);
      setNotice(
        got === "image"
          ? { tone: "amber", text: "نُزّل الملف بجودة الصورة لأن خدمة PDF غير متاحة مؤقتاً." }
          : null,
      );
    } catch {
      setNotice({ tone: "red", text: "تعذّر تجهيز الملف" });
    }
  };

  const menu: MenuItem[] = [
    { section: "تنزيل وطباعة" },
    {
      label: "تنزيل PDF",
      hint: "بمقاس A4 كما يظهر",
      icon: <FileDown />,
      onSelect: () => download("pdf"),
    },
    {
      label: "تصدير Word",
      hint: "للتعديل على الصياغة",
      icon: <FileText />,
      onSelect: () => download("word"),
    },
    { label: "طباعة / حفظ PDF", icon: <Printer />, onSelect: print },
    ...(manager
      ? ([
          {
            label: "نسخ كمستند جديد",
            icon: <Copy />,
            onSelect: async () => {
              const r = await docApi.duplicate(docId);
              await qc.invalidateQueries({ queryKey: docKeys.list(projectId) });
              await navigate({
                to: "/projects/$id/documents/$docId",
                params: { id: projectId, docId: r.id },
              });
            },
          },
          ...(doc.status === "draft" && versions.length === 0
            ? [
                "separator",
                {
                  label: "حذف المسودة",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: async () => {
                    if (!confirm("حذف هذه المسودة نهائياً؟")) return;
                    await docApi.remove(docId);
                    await qc.invalidateQueries({ queryKey: docKeys.list(projectId) });
                    await navigate({
                      to: "/projects/$id",
                      params: { id: projectId },
                      search: { view: "documents" },
                    });
                  },
                },
              ]
            : []),
        ] as MenuItem[])
      : []),
  ];

  return (
    <>
      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <nav className="mb-1 text-sm text-muted">
            <Link
              to="/projects/$id"
              params={{ id: projectId }}
              search={{ view: "documents" }}
              className="hover:text-ink"
            >
              ← مستندات المشروع
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{draft.title || DOC_KIND_LABELS[doc.kind]}</h1>
            <Badge tone={STATUS_TONE[doc.status]}>{DOC_STATUS_LABELS[doc.status]}</Badge>
            <span className="text-sm text-muted" dir="ltr">
              {draft.number}
            </span>
            {outgoingRef && (
              <Badge tone="blue">
                صادر: <span dir="rtl">{outgoingRef}</span>
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted" aria-live="polite">
            {!manager
              ? "للاطلاع والطباعة"
              : doc.status === "approved"
                ? `اعتُمد ${fromEpoch(doc.approvedAt)} · مقفل عن التعديل`
                : saveState === "saving"
                  ? "جارٍ الحفظ…"
                  : saveState === "pending"
                    ? "تعديلات غير محفوظة…"
                    : saveState === "saved"
                      ? "حُفظ ✓"
                      : "يُحفظ تلقائياً"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manager && doc.status === "draft" && (
            <Button variant="secondary" onClick={() => moveStatus("review")}>
              <Send className="size-4" /> إرسال للمراجعة
            </Button>
          )}
          {manager && doc.status === "review" && (
            <Button variant="secondary" onClick={() => moveStatus("draft")}>
              <Undo2 className="size-4" /> إعادة للمسودة
            </Button>
          )}
          {manager && doc.status !== "approved" && (
            <Button onClick={() => moveStatus("approved")}>
              <Check className="size-4" /> اعتماد
            </Button>
          )}
          {manager && doc.status === "approved" && (
            <Button variant="secondary" onClick={() => setSending(true)}>
              <Share2 className="size-4" /> إرسال
            </Button>
          )}
          {manager && doc.status === "approved" && !doc.outgoingNo && (
            <Button onClick={registerOutgoing}>
              <Stamp className="size-4" /> تسجيل صادر
            </Button>
          )}
          {manager && doc.status === "approved" && (
            <Button variant="secondary" onClick={() => moveStatus("draft")}>
              <RotateCcw className="size-4" /> إعادة فتح للتعديل
            </Button>
          )}
          <Button variant="secondary" onClick={print} aria-label="طباعة أو حفظ PDF">
            <Printer className="size-4" />
          </Button>
          <Menu items={menu} label="إجراءات المستند" />
        </div>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {sending && q.data && <SendDialog detail={q.data} onClose={() => setSending(false)} />}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* ── Preview (also what prints) ───────────────────── */}
        <div className="print-root min-w-0 rounded-2xl bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0">
          <FitToWidth>
            <DocumentView
              kind={doc.kind}
              number={draft.number}
              title={draft.title}
              content={draft.content}
              layout={draft.layout}
              values={values}
              org={org}
              editing={!locked}
              approved={doc.status === "approved"}
              outgoing={outgoingRef}
            />
          </FitToWidth>
        </div>

        {/* ── Side panel ───────────────────────────────────── */}
        <aside className="space-y-4 print:hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          <Segmented<Panel>
            label="لوحات التحرير"
            value={panel}
            onChange={setPanel}
            items={[
              { value: "data", label: "البيانات" },
              { value: "content", label: doc.kind === "contract" ? "البنود" : "النص" },
              { value: "format", label: "التنسيق" },
            ]}
          />
          {panel === "data" && (
            <DataPanel
              kind={doc.kind}
              draft={draft}
              auto={auto}
              values={values}
              locked={locked}
              setVar={setVar}
              setTitle={(title) => change({ title }, { title })}
              setNumber={(number) => change({ number }, { number })}
            />
          )}
          {panel === "content" &&
            (doc.kind === "contract" ? (
              <ClausesPanel clauses={draft.content} locked={locked} onChange={setContent} />
            ) : (
              <Card>
                <Field label="نص الخطاب">
                  <Textarea
                    rows={14}
                    disabled={locked}
                    value={draft.content[0]?.content ?? ""}
                    onChange={(e) =>
                      setContent([
                        {
                          ...(draft.content[0] ?? {
                            id: "body",
                            key: "body",
                            title: "",
                            baseTitle: "",
                            pageBreak: false,
                          }),
                          content: e.target.value,
                        },
                      ])
                    }
                  />
                </Field>
                <p className="mt-2 text-xs text-muted">
                  افصلوا الفقرات بسطر فارغ. المتغيرات مثل {"{{cashback_amount}}"} تُستبدل تلقائياً.
                </p>
              </Card>
            ))}
          {panel === "format" && (
            <FormatPanel
              layout={draft.layout}
              locked={locked}
              orgUrls={org.urls}
              setLayout={setLayout}
            />
          )}
          {versions.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold">سجل الاعتماد</h2>
              <ul className="space-y-1 text-xs text-muted">
                {versions.map((v) => (
                  <li key={v.version}>
                    الإصدار {v.version} · اعتُمد {fromEpoch(v.approvedAt)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function DataPanel({
  kind,
  draft,
  auto,
  values,
  locked,
  setVar,
  setTitle,
  setNumber,
}: {
  kind: "contract" | "letter";
  draft: Draft;
  auto: Resolved;
  values: Resolved;
  locked: boolean;
  setVar: (k: string, v: string) => void;
  setTitle: (v: string) => void;
  setNumber: (v: string) => void;
}) {
  const groups = kind === "contract" ? CONTRACT_GROUPS : LETTER_GROUPS;
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3">
          <Field label={kind === "contract" ? "عنوان العقد" : "موضوع الخطاب"}>
            <Input
              value={draft.title}
              disabled={locked}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="رقم المستند" hint="يُولَّد تلقائياً ويمكن تعديله">
            <Input
              dir="ltr"
              value={draft.number}
              disabled={locked}
              onChange={(e) => setNumber(e.target.value)}
            />
          </Field>
        </div>
      </Card>
      {groups.map((g) => (
        <Card key={g.title}>
          <h2 className="mb-3 text-sm font-semibold">{g.title}</h2>
          <div className="grid gap-3">
            {g.keys.map((k) => {
              const a = auto[k];
              const val = draft.variables[k] ?? "";
              const isAuto = a && a.value === val && a.source !== "manual";
              const hint =
                k === "contract_date_hijri"
                  ? `تلقائي: ${values.contract_date_hijri?.value || "—"} — اتركوه فارغاً ليتبع التاريخ الميلادي`
                  : isAuto
                    ? `تلقائي · ${SOURCE_LABEL[a.source] ?? ""}`
                    : a && a.value && a.value !== val
                      ? "معدّل يدوياً"
                      : undefined;
              return (
                <div key={k} className="relative">
                  <Field label={VAR_LABELS[k] ?? k} hint={hint}>
                    <Input
                      type={DATE_KEYS.has(k) ? "date" : "text"}
                      value={val}
                      disabled={locked}
                      onChange={(e) => setVar(k, e.target.value)}
                    />
                  </Field>
                  {!locked && a && a.value && a.value !== val && k !== "contract_date_hijri" && (
                    <button
                      type="button"
                      className="absolute top-0 left-0 text-xs text-brand hover:underline"
                      onClick={() => setVar(k, a.value)}
                    >
                      استعادة التلقائي
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

const LIB_CONTENT = (key: string) => {
  for (const t of Object.values(CONTRACT_TEMPLATES)) {
    const c = t.clauses.find((x) => x.key === key);
    if (c) return c.content;
  }
  return "";
};

function ClausesPanel({
  clauses,
  locked,
  onChange,
}: {
  clauses: Clause[];
  locked: boolean;
  onChange: (c: Clause[]) => void;
}) {
  const [editing, setEditing] = useState<Clause | null>(null);
  const [lib, setLib] = useState("");
  const move = (i: number, d: -1 | 1) => {
    const next = [...clauses];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as Clause, next[i] as Clause];
    onChange(next);
  };
  const add = () => {
    const item = CLAUSE_LIBRARY.find((c) => c.key === lib);
    if (!item) return;
    onChange([
      ...clauses,
      {
        id: `cl_${crypto.randomUUID().slice(0, 12)}`,
        key: item.key,
        title: "",
        baseTitle: item.title,
        content: LIB_CONTENT(item.key),
        pageBreak: false,
      },
    ]);
    setLib("");
  };
  return (
    <Card className="p-0">
      <ol className="divide-y">
        {clauses.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {c.title || c.baseTitle || "بند بلا عنوان"}
            </span>
            {!locked && (
              <span className="flex shrink-0 gap-0.5">
                <IconBtn label="أعلى" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label="أسفل"
                  onClick={() => move(i, 1)}
                  disabled={i === clauses.length - 1}
                >
                  <ArrowDown className="size-3.5" />
                </IconBtn>
                <IconBtn label="تعديل" onClick={() => setEditing(c)}>
                  <Pencil className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label="حذف"
                  onClick={() =>
                    confirm(`حذف «${c.title || c.baseTitle}»؟`) &&
                    onChange(clauses.filter((x) => x.id !== c.id))
                  }
                >
                  <Trash2 className="size-3.5" />
                </IconBtn>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="flex gap-2 border-t p-4">
          <Select
            aria-label="إضافة بند من المكتبة"
            value={lib}
            onChange={(e) => setLib(e.target.value)}
          >
            <option value="">إضافة بند من المكتبة…</option>
            {CLAUSE_LIBRARY.map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={add} disabled={!lib}>
            إضافة
          </Button>
        </div>
      )}
      {editing && (
        <ClauseDialog
          clause={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            onChange(clauses.map((x) => (x.id === c.id ? c : x)));
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-muted hover:bg-brand-soft hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ClauseDialog({
  clause,
  onClose,
  onSave,
}: {
  clause: Clause;
  onClose: () => void;
  onSave: (c: Clause) => void;
}) {
  const [c, setC] = useState(clause);
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    if (!key) return;
    const el = ref.current;
    const token = `{{${key}}}`;
    const at = el?.selectionStart ?? c.content.length;
    const content = c.content.slice(0, at) + token + c.content.slice(el?.selectionEnd ?? at);
    setC({ ...c, content });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="تعديل البند" wide>
      <div className="space-y-4">
        <Field label={c.baseTitle ? "عنوان البند (يُرقَّم تلقائياً)" : "عنوان البند"}>
          <Input
            value={c.baseTitle || c.title}
            onChange={(e) =>
              setC(
                c.baseTitle ? { ...c, baseTitle: e.target.value } : { ...c, title: e.target.value },
              )
            }
          />
        </Field>
        <Field label="النص" hint="افصلوا الفقرات بسطر فارغ">
          <Textarea
            ref={ref}
            rows={12}
            value={c.content}
            onChange={(e) => setC({ ...c, content: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="إدراج متغير"
            value=""
            onChange={(e) => insert(e.target.value)}
            className="w-auto"
          >
            <option value="">إدراج متغير…</option>
            {Object.entries(VAR_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={c.pageBreak}
              onChange={(e) => setC({ ...c, pageBreak: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />
            يبدأ في صفحة جديدة
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => onSave(c)}>حفظ البند</Button>
        </div>
      </div>
    </Dialog>
  );
}

function FormatPanel({
  layout: l,
  locked,
  orgUrls,
  setLayout,
}: {
  layout: DocLayout;
  locked: boolean;
  orgUrls: Record<string, string>;
  setLayout: (l: Partial<DocLayout>) => void;
}) {
  const Range = ({
    k,
    label,
    min,
    max,
    step,
  }: {
    k: "fontSize" | "lineHeight" | "titleSize" | "clauseTitleSize" | "marginX";
    label: string;
    min: number;
    max: number;
    step: number;
  }) => (
    <label className="block text-sm">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-muted" dir="ltr">
          {l[k]}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={l[k]}
        disabled={locked}
        onChange={(e) => setLayout({ [k]: Number(e.target.value) })}
        className="w-full accent-[var(--color-brand)]"
      />
    </label>
  );
  const Toggle = ({
    k,
    label,
    hint,
  }: {
    k: "showHeader" | "showFooter" | "showSignatures" | "useOrgSignature" | "useOrgStamp";
    label: string;
    hint?: string;
  }) => (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={l[k]}
        disabled={locked}
        onChange={(e) => setLayout({ [k]: e.target.checked })}
        className="mt-1 size-4 accent-[var(--color-brand)]"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">الخط والمسافات</h2>
        <Range k="fontSize" label="حجم النص" min={10} max={16} step={0.5} />
        <Range k="lineHeight" label="تباعد الأسطر" min={1.2} max={2.4} step={0.1} />
        <Range k="titleSize" label="حجم العنوان" min={14} max={26} step={1} />
        <Range k="clauseTitleSize" label="حجم عناوين البنود" min={11} max={18} step={0.5} />
        <Range k="marginX" label="الهامش الجانبي (سم)" min={1} max={3.5} step={0.1} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">الترويسة والتوقيع</h2>
        <Toggle
          k="showHeader"
          label="ترويسة الجهة أعلى كل صفحة"
          hint={orgUrls.headerAsset ? undefined : "لم تُرفع ترويسة في بيانات الجهة"}
        />
        <Toggle
          k="showFooter"
          label="تذييل الجهة أسفل كل صفحة"
          hint={orgUrls.footerAsset ? undefined : "لم يُرفع تذييل في بيانات الجهة"}
        />
        <Toggle k="showSignatures" label="خانة التوقيعات" />
        <Toggle
          k="useOrgSignature"
          label="إدراج توقيع الجهة"
          hint={orgUrls.signatureAsset ? undefined : "لم يُرفع توقيع"}
        />
        <Toggle
          k="useOrgStamp"
          label="إدراج ختم الجهة"
          hint={orgUrls.stampAsset ? undefined : "لم يُرفع ختم"}
        />
        <Field label="عبارة التذييل">
          <Select
            value={l.footerLabel}
            disabled={locked}
            onChange={(e) => setLayout({ footerLabel: e.target.value as DocLayout["footerLabel"] })}
          >
            <option value="">بدون</option>
            {["سري", "مسودة", "نسخة طبق الأصل", "نهائي"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-muted">
          الصور تُدار من{" "}
          <Link to="/settings/org" className="text-brand underline">
            الإعدادات › بيانات الجهة
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
