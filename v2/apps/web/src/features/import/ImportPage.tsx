import {
  type ClientPreview,
  parseV1Export,
  previewClients,
  selectClients,
  type V1Workspace,
} from "@buad/migrate/v1-export";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, FileUp, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../api";
import { Badge, Button, Card, EmptyState, Notice, PageHeader } from "../../components/ui";
import { ApiError, ok } from "../../lib/format";
import { clientKeys, clientsQuery } from "../clients/api";
import { CLIENT_TYPE_LABELS, label, PROJECT_STATUS_LABELS, STATUS_TONE } from "../labels";
import { projectKeys } from "../projects/api";

/** FileReader works in every browser we support (File.text() is missing in older Safari). */
const readText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

type Issue = {
  kind: "client" | "project";
  id: string;
  name: string;
  severity: "rejected" | "fixed";
  reason: string;
};
type Parity = {
  projectId: string;
  name: string;
  status: "exact" | "rounding" | "mismatch";
  diffs: { field: string; v1: number; v2: number }[];
};
type Result = {
  clients: { created: number; updated: number };
  projects: { created: number; updated: number };
  finance?: { imported: number; skipped: number; parity: Parity[] };
  issues: Issue[];
};
const FIELD_AR: Record<string, string> = {
  grossTotal: "قيمة العقد الكاملة",
  contractNet: "الصافي",
  vatAmt: "الضريبة",
  execAmt: "أتعاب التنفيذ",
  mkt: "التسويق",
  cb: "كاش باك",
  cfAmt: "رسوم إضافية",
  available: "المتاح للتنفيذ",
  obligations: "الالتزامات",
  totalIncome: "الدخل",
  totalExpenses: "المصاريف",
  opExpenses: "المصاريف التشغيلية",
  remainingExec: "المتبقي للتنفيذ",
  remaining: "المتبقي من العقد",
  profitMargins: "هوامش الربح",
  profit: "صافي الربح",
  budgetTotal: "الميزانية",
  missingItems: "البنود غير المسجلة",
};
const SUGGESTED = 3;

export function ImportPage() {
  const qc = useQueryClient();
  const [ws, setWs] = useState<V1Workspace | null>(null);
  const [fileName, setFileName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const live = useQuery(clientsQuery({}));
  const archived = useQuery(clientsQuery({ archived: "1" }));
  const already = useMemo(
    () => new Set([...(live.data?.items ?? []), ...(archived.data?.items ?? [])].map((c) => c.id)),
    [live.data, archived.data],
  );
  const list = useMemo(() => (ws ? previewClients(ws) : []), [ws]);
  const suggested = useMemo(
    () =>
      list
        .filter((c) => c.projectCount > 0)
        .slice(0, SUGGESTED)
        .map((c) => c.id),
    [list],
  );
  const selected = list.filter((c) => picked.has(c.id));
  const projectTotal = selected.reduce((a, c) => a + c.projectCount, 0);

  const readFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setResult(null);
    const parsed = parseV1Export(await readText(file).catch(() => ""));
    if (!parsed) return setError("هذا الملف ليس ملف تصدير من المنصة الحالية.");
    if (!parsed.clients.length) return setError("الملف لا يحتوي عملاء.");
    setWs(parsed);
    setFileName(file.name);
    const top = previewClients(parsed)
      .filter((c) => c.projectCount > 0)
      .slice(0, SUGGESTED);
    setPicked(new Set(top.map((c) => c.id)));
  };

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const run = async () => {
    if (!ws || !picked.size) return;
    setBusy(true);
    setError(null);
    try {
      const body = selectClients(ws, [...picked]);
      const r = await ok<Result>(await api.api.import.v1.$post({ json: body as never }));
      setResult(r);
      await Promise.all([
        qc.invalidateQueries({ queryKey: clientKeys.all }),
        qc.invalidateQueries({ queryKey: projectKeys.all }),
      ]);
    } catch (x) {
      setError(
        x instanceof ApiError && x.status === 403
          ? "الاستيراد متاح لمالك المنصة فقط."
          : "تعذّر الاستيراد، لم يُحفظ شيء. حاولوا مرة أخرى.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="استيراد من المنصة الحالية"
        subtitle="انقلوا عميلاً أو أكثر بكامل بياناته ومشاريعه لتجربة الإصدار الثاني"
      />
      {error && <Notice>{error}</Notice>}

      {result ? (
        <ResultView r={result} onAgain={() => setResult(null)} />
      ) : !ws ? (
        <Card>
          <ol className="mb-6 list-decimal space-y-2 ps-5 text-sm">
            <li>
              في المنصة الحالية افتحوا <b>الإعدادات</b> ثم قسم <b>إدارة البيانات</b> واضغطوا{" "}
              <b>«تصدير البيانات»</b>.
            </li>
            <li>اختاروا الملف الذي نزل هنا. يُقرأ في متصفحكم أولاً ولا يُرسل شيء قبل موافقتكم.</li>
          </ol>
          <label
            htmlFor="v1-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition hover:border-brand hover:bg-brand-soft"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              readFile(e.dataTransfer.files[0]);
            }}
          >
            <FileUp className="size-8 text-brand" />
            <span className="font-semibold">اختاروا ملف التصدير أو اسحبوه هنا</span>
            <span className="text-xs text-muted">ملف JSON من «تصدير البيانات»</span>
          </label>
          <input
            id="v1-file"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
        </Card>
      ) : (
        <>
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold">{fileName}</p>
              <p className="text-muted">
                {list.length} عميل · {ws.projects.length} مشروع في الملف
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setPicked(new Set(suggested))}>
                <Sparkles className="size-4" /> المقترَحون للتجربة
              </Button>
              <Button variant="secondary" onClick={() => setPicked(new Set(list.map((c) => c.id)))}>
                الكل
              </Button>
              <Button variant="ghost" onClick={() => setPicked(new Set())}>
                إلغاء التحديد
              </Button>
              <Button variant="ghost" onClick={() => setWs(null)}>
                ملف آخر
              </Button>
            </div>
          </Card>
          <p className="mb-3 text-sm text-muted">
            رُتّب العملاء حسب ملاءمتهم للتجربة: اكتمال البيانات، وعدد المشاريع، وتنوّع حالاتها، ووجود
            قيم عقود. المقترَحون محدَّدون مسبقاً.
          </p>
          <Card className="mb-24 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-right text-xs text-muted">
                <tr>
                  <th className="w-10 p-3" />
                  <th className="p-3 font-medium">العميل</th>
                  <th className="p-3 font-medium">المشاريع</th>
                  <th className="p-3 font-medium">اكتمال البيانات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <Row
                    key={c.id}
                    c={c}
                    checked={picked.has(c.id)}
                    onToggle={() => toggle(c.id)}
                    suggested={suggested.includes(c.id)}
                    imported={already.has(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </Card>
          <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-surface/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <p className="text-sm">
                <b>{selected.length}</b> عميل و<b>{projectTotal}</b> مشروع
              </p>
              <Button onClick={run} disabled={!picked.size || busy}>
                {busy ? "جارٍ الاستيراد…" : "استيراد المحدد"}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Row({
  c,
  checked,
  onToggle,
  suggested,
  imported,
}: {
  c: ClientPreview;
  checked: boolean;
  onToggle: () => void;
  suggested: boolean;
  imported: boolean;
}) {
  const id = `pick-${c.id}`;
  return (
    <tr className="border-b last:border-0 hover:bg-brand-soft/40">
      <td className="p-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-4 accent-[var(--color-brand)]"
        />
      </td>
      <td className="p-3">
        <label htmlFor={id} className="cursor-pointer">
          <span className="font-semibold">{c.name}</span>{" "}
          {suggested && <Badge tone="blue">مقترح</Badge>}{" "}
          {imported && <Badge tone="green">مستورد سابقاً</Badge>}
          <span className="block text-xs text-muted">
            {label(CLIENT_TYPE_LABELS, c.type || "company")}
            {c.city && ` · ${c.city}`}
          </span>
        </label>
      </td>
      <td className="p-3">
        <span className="me-2">{c.projectCount}</span>
        {Object.entries(c.statuses).map(([s, n]) => (
          <span key={s} className="me-1">
            <Badge tone={STATUS_TONE[s] ?? "gray"}>
              {label(PROJECT_STATUS_LABELS, s)} {n}
            </Badge>
          </span>
        ))}
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${c.completeness}%` }}
            />
          </div>
          <span className="text-xs text-muted">{c.completeness}%</span>
        </div>
      </td>
    </tr>
  );
}

function ResultView({ r, onAgain }: { r: Result; onAgain: () => void }) {
  const rejected = r.issues.filter((i) => i.severity === "rejected");
  const fixed = r.issues.filter((i) => i.severity === "fixed");
  return (
    <>
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <div>
            <p className="text-lg font-bold">تم الاستيراد</p>
            <p className="text-sm text-muted">
              عملاء: {r.clients.created} جديد، {r.clients.updated} حُدّث · مشاريع:{" "}
              {r.projects.created} جديد، {r.projects.updated} حُدّث
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/clients"
            className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white dark:text-canvas"
          >
            عرض العملاء
          </Link>
          <Link to="/projects" className="rounded-lg border px-3.5 py-2 text-sm font-semibold">
            عرض المشاريع
          </Link>
          <Button variant="ghost" onClick={onAgain}>
            استيراد عملاء آخرين
          </Button>
        </div>
      </Card>
      {r.finance && r.finance.parity.length > 0 && <ParityView f={r.finance} />}
      {r.issues.length === 0 ? (
        <EmptyState title="لا ملاحظات" text="نُقلت كل السجلات المحددة كما هي." />
      ) : (
        [
          ["لم يُنقل (يحتاج تصحيحاً في المنصة الحالية)", rejected],
          ["نُقل مع تصحيح", fixed],
        ].map(([title, items]) =>
          (items as Issue[]).length ? (
            <Card key={title as string} className="mb-4">
              <h2 className="mb-3 font-semibold">{title as string}</h2>
              <ul className="divide-y text-sm">
                {(items as Issue[]).map((i) => (
                  <li key={`${i.kind}-${i.id}-${i.reason}`} className="py-2">
                    <span className="font-medium">{i.name || i.id}</span>{" "}
                    <span className="text-muted">— {i.reason}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null,
        )
      )}
    </>
  );
}

/** Proof that every imported project shows the same numbers as in the current platform. */
function ParityView({ f }: { f: NonNullable<Result["finance"]> }) {
  const exact = f.parity.filter((p) => p.status === "exact").length;
  const rounding = f.parity.filter((p) => p.status === "rounding");
  const mismatch = f.parity.filter((p) => p.status === "mismatch");
  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold">مطابقة الأرقام المالية مع المنصة الحالية</h2>
      <p className="mb-3 text-sm text-muted">
        لكل مشروع حُسبت أرقامه بمعادلة المنصة الحالية نفسها ثم قورنت بما حُفظ هنا.
      </p>
      <p
        className={`text-lg font-bold ${mismatch.length ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}
      >
        {mismatch.length
          ? `${mismatch.length} مشروع يحتاج مراجعة`
          : `الأرقام مطابقة ✓ ${exact + rounding.length}/${f.parity.length}`}
      </p>
      {rounding.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {rounding.length} منها بفرق تقريب أقل من هللة لكل مبلغ، لأن المنصة الحالية خزّنت كسوراً أصغر
          من الهللة.
        </p>
      )}
      {f.skipped > 0 && (
        <p className="mt-1 text-xs text-muted">
          {f.skipped} مشروع لم تُستبدل ماليته لأنها عُدّلت هنا بعد الاستيراد.
        </p>
      )}
      {mismatch.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {mismatch.map((p) => (
            <li key={p.projectId} className="py-2">
              <span className="font-medium">{p.name}</span>
              <ul className="mt-1 text-xs text-muted">
                {p.diffs.map((d) => (
                  <li key={d.field}>
                    {FIELD_AR[d.field] ?? d.field}: المنصة الحالية {d.v1.toFixed(2)} · هنا{" "}
                    {d.v2.toFixed(2)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
