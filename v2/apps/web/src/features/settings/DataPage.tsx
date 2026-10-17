import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileUp } from "lucide-react";
import { useState } from "react";
import { Button, Card, Notice, PageHeader, toast } from "../../components/ui";
import { downloadText, downloadWorkbook } from "../../lib/export";
import { ago, ok } from "../../lib/format";
import { useCan } from "../../session";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import { auditQuery } from "../team/queries";

type Row = Record<string, unknown>;
type Export = { exportedAt: string; counts: Record<string, number>; tables: Record<string, Row[]> };

const riyals = (h: unknown) => Math.round(Number(h ?? 0)) / 100;
const str = (v: unknown) => (v == null ? "" : String(v));

async function fetchExport() {
  const res = await fetch("/api/org/export");
  if (!res.ok) await ok(res);
  return {
    text: await res.text(),
    name: `buad-backup-${new Date().toISOString().slice(0, 10)}.json`,
  };
}

/** The main lists as one Excel file, in riyals with the platform's labels. */
function workbookFrom(data: Export) {
  const t = data.tables;
  const live = (rows: Row[] = []) => rows.filter((r) => !r.archivedAt);
  const projectNo = new Map((t.projects ?? []).map((p) => [p.id, str(p.number)]));
  const clientName = new Map((t.clients ?? []).map((c) => [c.id, str(c.name)]));
  return [
    {
      name: "العملاء",
      header: ["الرقم", "الاسم", "المدينة", "الهاتف", "البريد", "السجل", "الرقم الضريبي"],
      rows: live(t.clients).map((c) => [
        str(c.code),
        str(c.name),
        str(c.city),
        str(c.phone),
        str(c.email),
        str(c.regNo),
        str(c.taxNo),
      ]),
    },
    {
      name: "المشاريع",
      header: ["الرقم", "المشروع", "العميل", "الحالة", "البداية", "النهاية", "القيمة المتوقعة"],
      money: [6],
      rows: live(t.projects).map((p) => [
        str(p.number),
        str(p.name),
        clientName.get(p.clientId) ?? "",
        label(PROJECT_STATUS_LABELS, str(p.status)),
        str(p.startDate),
        str(p.endDate),
        riyals(p.expectedValue),
      ]),
    },
    {
      name: "المقبوضات",
      header: ["التاريخ", "المشروع", "المبلغ", "معتمد", "ملاحظة"],
      money: [2],
      rows: (t.project_receipts ?? []).map((r) => [
        str(r.date),
        projectNo.get(r.projectId) ?? "",
        riyals(r.amount),
        r.approvedAt ? "نعم" : "لا",
        str(r.note),
      ]),
    },
  ];
}

/** «البيانات»: a full copy to keep, the main lists in Excel, and the import. */
export function DataPage() {
  const can = useCan();
  const [busy, setBusy] = useState<"" | "json" | "xlsx">("");
  const [error, setError] = useState("");
  const log = useQuery({ ...auditQuery({ entity: "org" }), enabled: can("audit.view") });
  const last = log.data?.find((i) => i.action === "export");

  const run = async (kind: "json" | "xlsx") => {
    setBusy(kind);
    setError("");
    try {
      const { text, name } = await fetchExport();
      if (kind === "json") downloadText(text, name);
      else
        await downloadWorkbook(
          `buad-lists-${new Date().toISOString().slice(0, 10)}`,
          workbookFrom(JSON.parse(text) as Export),
        );
      toast(kind === "json" ? "نُزّلت النسخة الكاملة" : "نُزّل ملف Excel");
      await log.refetch();
    } catch {
      setError("تعذّر تجهيز النسخة. حاولوا مرة أخرى.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="البيانات"
        subtitle="نسخة كاملة تحتفظون بها، والقوائم الأساسية في Excel، ونقل البيانات من المنصة السابقة."
      />
      {error && <Notice>{error}</Notice>}
      {can("org.edit") && (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">نسخة احتياطية</h2>
          <p className="text-sm text-muted">
            ملف واحد بكل سجلات المنشأة: العملاء، والمشاريع، والمالية، والمستندات، والمهام، والخطط.
            الملفات المرفوعة تُدرج بروابطها. احفظوه في مكان آمن؛ يُسجَّل كل تنزيل في سجل النشاط.
          </p>
          {last && (
            <p className="text-xs text-muted">
              آخر تنزيل: {ago(last.at)}، بواسطة {last.userName || "—"}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy !== ""} onClick={() => run("json")}>
              <Download className="size-4" />
              {busy === "json" ? "جارٍ التجهيز…" : "تنزيل نسخة كاملة (JSON)"}
            </Button>
            <Button variant="secondary" disabled={busy !== ""} onClick={() => run("xlsx")}>
              <FileSpreadsheet className="size-4" />
              {busy === "xlsx" ? "جارٍ التجهيز…" : "العملاء والمشاريع والمقبوضات (Excel)"}
            </Button>
          </div>
        </Card>
      )}
      {can("import.run") && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">الاستيراد</h2>
            <p className="text-sm text-muted">نقل العملاء والمشاريع من المنصة السابقة.</p>
          </div>
          <Link
            to="/settings/import"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-semibold hover:bg-brand-soft"
          >
            <FileUp className="size-4" /> فتح الاستيراد
          </Link>
        </Card>
      )}
    </div>
  );
}
