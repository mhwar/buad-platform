import {
  COMPANY_CAT_LABELS,
  COMPANY_EXPENSE_CATS,
  COMPANY_INCOME_CATS,
  RETAINED_LABELS,
} from "@buad/schema/company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Notice,
  Pills,
  Select,
  Textarea,
} from "../../components/ui";
import { day, sar, today } from "../../lib/format";
import { label, PROJECT_STATUS_LABELS } from "../labels";
import type { Period } from "./api";
import { MonthlyBars } from "./charts";
import {
  type CompanyEntry,
  companyApi,
  companyEntriesQuery,
  companyKeys,
  companyOverviewQuery,
} from "./company-api";
import { Tile } from "./Tile";

type Filter = "all" | "income" | "expense";

/** «الشركة»: company income and expenses beyond projects, and what the company earned. */
export function CompanyTab({ period }: { period: Period }) {
  const o = useQuery(companyOverviewQuery(period));
  if (o.isPending)
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  if (o.isError || !o.data)
    return (
      <EmptyState
        title="تعذّر تحميل مالية الشركة"
        action={<Button onClick={() => o.refetch()}>إعادة المحاولة</Button>}
      />
    );
  const d = o.data;
  const idle = d.projects.filter((p) => !p.earning);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title="أرباح المشاريع"
          value={sar(d.calc.projectProfit)}
          sub="المشاريع الجارية والمكتملة"
        />
        <Tile title="إيرادات الخدمات" value={sar(d.calc.serviceIncome)} sub="بتاريخ وصولها للبنك" />
        <Tile title="مصروفات الشركة" value={sar(d.calc.companyExpenses)} />
        <Tile
          title="صافي ربح الشركة"
          value={sar(d.calc.netProfit)}
          tone={d.calc.netProfit >= 0 ? "good" : "bad"}
          sub="في الفترة المختارة"
        />
        <Tile
          title="المتاح للتوزيع"
          value={sar(d.allTime.available)}
          sub={`كل الفترات − ما وُزّع (${sar(d.allTime.distributed)})`}
        />
        <Tile
          title="الحد الأدنى في البنك"
          value={sar(d.bankMinimum)}
          sub="ما تحتاجه المشاريع الجارية للتنفيذ"
          tone="warn"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-3 font-semibold">إيرادات ومصروفات الشركة شهرياً</h2>
          <MonthlyBars data={d.monthly} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">المحتجز من التوزيعات</h2>
          <ul className="space-y-2 text-sm">
            {(["ops", "dev", "reserve"] as const).map((k) => (
              <li key={k} className="flex justify-between">
                <span>{RETAINED_LABELS[k]}</span>
                <b>{sar(d.retained[k])}</b>
              </li>
            ))}
            <li className="flex justify-between border-t pt-2 font-semibold">
              <span>الإجمالي</span>
              <span>{sar(d.retained.total)}</span>
            </li>
          </ul>
        </Card>
      </div>

      <Ledger />

      {idle.length > 0 && <IdleProjects items={idle} />}
    </div>
  );
}

function Ledger() {
  const [filter, setFilter] = useState<Filter>("all");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<CompanyEntry | "new-income" | "new-expense" | null>(null);
  const q = useQuery(companyEntriesQuery(archived));
  const qc = useQueryClient();
  const rows = (q.data ?? []).filter((e) => filter === "all" || e.type === filter);
  const restore = async (id: string) => {
    await companyApi.restoreEntry(id);
    await qc.invalidateQueries({ queryKey: companyKeys.all });
  };
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="font-semibold">
          {archived ? "القيود المحذوفة" : "سجل إيرادات ومصروفات الشركة"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <>
              <Button variant="secondary" onClick={() => setEditing("new-income")}>
                <Plus className="size-4" /> إيراد
              </Button>
              <Button variant="secondary" onClick={() => setEditing("new-expense")}>
                <Plus className="size-4" /> مصروف
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setArchived((a) => !a)}
            className="text-xs text-muted underline hover:text-ink"
          >
            {archived ? "العودة للسجل" : "المحذوفات"}
          </button>
        </div>
      </div>
      <div className="px-5 pt-3">
        <Pills<Filter>
          value={filter}
          onChange={(v) => setFilter((v || "all") as Filter)}
          items={[
            { value: "all", label: "الكل" },
            { value: "income", label: "إيرادات" },
            { value: "expense", label: "مصروفات" },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {archived
            ? "لا قيود محذوفة."
            : "لا قيود بعد. سجّلوا إيرادات الخدمات ومصروفات الشركة العامة هنا."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted">
              <tr className="border-b">
                <th className="px-5 py-2 font-medium">التاريخ</th>
                <th className="px-2 py-2 font-medium">البيان</th>
                <th className="px-2 py-2 font-medium">التصنيف</th>
                <th className="px-5 py-2 text-left font-medium">المبلغ</th>
                {archived && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b last:border-0 ${archived ? "" : "cursor-pointer hover:bg-brand-soft/50"}`}
                  onClick={() => !archived && setEditing(e)}
                  onKeyDown={(k) => !archived && k.key === "Enter" && setEditing(e)}
                  tabIndex={archived ? undefined : 0}
                >
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">
                    {day(e.date)}
                    {e.paymentDate && e.paymentDate !== e.date && (
                      <span className="block text-xs">وصل البنك {day(e.paymentDate)}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {e.description}
                    {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge tone={e.type === "income" ? "green" : "gray"}>
                      {COMPANY_CAT_LABELS[e.category] ?? e.category}
                    </Badge>
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-2.5 text-left font-semibold ${e.type === "income" ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                  >
                    {e.type === "income" ? "+" : "−"} {sar(e.amount)}
                  </td>
                  {archived && (
                    <td className="px-2">
                      <Button variant="secondary" onClick={() => restore(e.id)}>
                        <RotateCcw className="size-4" /> استعادة
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <EntryDialog
          entry={typeof editing === "string" ? null : editing}
          type={
            typeof editing === "string"
              ? editing === "new-income"
                ? "income"
                : "expense"
              : editing.type
          }
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function EntryDialog({
  entry,
  type,
  onClose,
}: {
  entry: CompanyEntry | null;
  type: "income" | "expense";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cats = (type === "income" ? COMPANY_INCOME_CATS : COMPANY_EXPENSE_CATS).filter(
    (c) => c !== "project_fee",
  );
  const [f, setF] = useState({
    category: entry?.category ?? "other",
    date: entry?.date ?? today(),
    paymentDate: entry?.paymentDate ?? "",
    description: entry?.description ?? "",
    amount: entry ? String(entry.amount) : "",
    note: entry?.note ?? "",
  });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const done = async () => {
    await qc.invalidateQueries({ queryKey: companyKeys.all });
    onClose();
  };
  const save = async () => {
    setErr("");
    const body = { type, ...f, amount: Number(f.amount) };
    if (!body.description.trim() || !(body.amount > 0)) return setErr("أدخلوا البيان والمبلغ");
    try {
      if (entry) await companyApi.updateEntry(entry.id, body);
      else await companyApi.addEntry(body);
      await done();
    } catch {
      setErr("تعذّر الحفظ");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${entry ? "تعديل" : "إضافة"} ${type === "income" ? "إيراد" : "مصروف"} للشركة`}
    >
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="البيان" className="sm:col-span-2">
          <Input value={f.description} onChange={set("description")} />
        </Field>
        <Field label="المبلغ (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={f.amount}
            onChange={set("amount")}
          />
        </Field>
        <Field label="التصنيف">
          <Select value={f.category} onChange={set("category")}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {COMPANY_CAT_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="التاريخ">
          <Input type="date" value={f.date} onChange={set("date")} />
        </Field>
        {type === "income" && (
          <Field label="تاريخ وصوله للبنك" hint="يحدد ربع السنة الذي يُحسب فيه">
            <Input type="date" value={f.paymentDate} onChange={set("paymentDate")} />
          </Field>
        )}
        <Field label="ملاحظة" className="sm:col-span-2">
          <Textarea rows={2} value={f.note} onChange={set("note")} />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {entry ? (
          <Button
            variant="secondary"
            onClick={async () => {
              if (!confirm("حذف هذا القيد؟ يمكن استعادته من «المحذوفات».")) return;
              await companyApi.removeEntry(entry.id);
              await done();
            }}
          >
            <Trash2 className="size-4" /> حذف
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save}>حفظ</Button>
      </div>
    </Dialog>
  );
}

/** Projects outside the company's numbers (draft, paused, cancelled), as v1 showed them. */
function IdleProjects({
  items,
}: {
  items: { id: string; name: string; status: string; profit: number }[];
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
      <h2 className="mb-1 font-semibold">مشاريع لا تدخل في أرباح الشركة</h2>
      <p className="mb-3 text-xs text-muted">
        تُحسب أرباح المشاريع الجارية والمكتملة فقط. غيّروا حالة المشروع من صفحته لإدخاله.
      </p>
      <ul className="divide-y rounded-lg border bg-surface text-sm">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-3">
            <Link to="/projects/$id" params={{ id: p.id }} className="text-brand hover:underline">
              {p.name}
            </Link>
            <span className="text-xs text-muted">
              {label(PROJECT_STATUS_LABELS, p.status)} · ربحه {sar(p.profit)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
