import {
  financeEntries,
  partners,
  paymentSchedule,
  projectReceipts,
  projects,
} from "@buad/schema/db";
import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "../auth/service";
import { contractTotalSql, inFinance } from "./common";
import { NOT_PURCHASES } from "./vat";

export type CheckRow = { label: string; detail: string; link: string };
export type Check = { key: string; title: string; hint: string; rows: CheckRow[] };

const sar = (h: number) =>
  `${(Math.round(h) / 100).toLocaleString("en", { maximumFractionDigits: 2 })} ر.س`;
const projectLink = (id: string) => `/projects/${id}?view=finance`;

/**
 * «تحتاج تدخلك»: figures that look wrong and need a person to look. Read-only: nothing here
 * changes data; each line links to where it is fixed by hand.
 */
export async function financeChecks(db: Db, orgId: string): Promise<Check[]> {
  const checks: Check[] = [];
  const live = and(eq(projects.orgId, orgId), inFinance());

  const unapproved = await db
    .select({
      id: projects.id,
      number: projects.number,
      name: projects.name,
      date: projectReceipts.date,
      amount: projectReceipts.amount,
    })
    .from(projectReceipts)
    .innerJoin(projects, eq(projects.id, projectReceipts.projectId))
    .where(and(live, isNull(projectReceipts.approvedAt)));
  checks.push({
    key: "unapproved_receipts",
    title: "استلامات غير معتمدة",
    hint: "لا تُحتسب في أي رقم حتى تُعتمد. اعتمدوها إن كانت دفعات فعلية، أو احذفوها إن كانت مكررة.",
    rows: unapproved.map((r) => ({
      label: `${r.number} · ${r.name}`,
      detail: `${sar(r.amount)} بتاريخ ${r.date}`,
      link: projectLink(r.id),
    })),
  });

  const over = await db
    .select({
      id: projects.id,
      number: projects.number,
      name: projects.name,
      gross: sql<number>`${contractTotalSql("projects")}`,
      received: sql<number>`COALESCE((SELECT SUM(r.amount_halalas) FROM project_receipts r
        WHERE r.project_id = projects.id AND r.approved_at IS NOT NULL), 0)`,
    })
    .from(projects)
    .where(live);
  checks.push({
    key: "over_contract",
    title: "مُستلم أكثر من قيمة العقد",
    hint: "إما أن قيمة العقد ناقصة في إعدادات العقد، أو أن استلاماً سُجّل مرتين.",
    rows: over
      .filter((p) => Number(p.received) > Number(p.gross) + 100)
      .map((p) => ({
        label: `${p.number} · ${p.name}`,
        detail: `استُلم ${sar(Number(p.received))} من عقد ${sar(Number(p.gross))}`,
        link: projectLink(p.id),
      })),
  });

  const people = await db
    .select({ name: partners.name, share: partners.sharePct })
    .from(partners)
    .where(and(eq(partners.orgId, orgId), isNull(partners.archivedAt)));
  const total = people.reduce((s, p) => s + p.share, 0);
  const names = people.map((p) => p.name.trim());
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  const partnerRows: CheckRow[] = [];
  if (people.length && Math.abs(total - 100) > 0.011)
    partnerRows.push({
      label: "مجموع الحصص",
      detail: `${Math.round(total * 100) / 100}% بدل 100%`,
      link: "/finance?tab=partners",
    });
  for (const d of dupes)
    partnerRows.push({ label: d, detail: "مسجّل أكثر من مرة", link: "/finance?tab=partners" });
  checks.push({
    key: "partners",
    title: "حصص الشركاء",
    hint: "لا يُعتمد أي توزيع حتى يكون مجموع الحصص 100% تماماً.",
    rows: partnerRows,
  });

  const entryRows = (
    rows: { id: string; number: string; name: string; desc: string; amount: number }[],
  ) =>
    rows.map((e) => ({
      label: `${e.number} · ${e.name}`,
      detail: `${e.desc || "بلا بيان"} · ${sar(e.amount)}`,
      link: projectLink(e.id),
    }));
  const entryCols = {
    id: projects.id,
    number: projects.number,
    name: projects.name,
    desc: financeEntries.description,
    amount: financeEntries.amount,
  };
  const vatPaid = await db
    .select(entryCols)
    .from(financeEntries)
    .innerJoin(projects, eq(projects.id, financeEntries.projectId))
    .where(and(live, eq(financeEntries.cat, "vat"), ne(financeEntries.status, "cancelled")));
  checks.push({
    key: "vat_as_expense",
    title: "ضريبة مسجّلة كمصروف مشروع",
    hint: "ما يُسدَّد للهيئة ليس تكلفة مشروع؛ سيُنقل إلى صفحة الضريبة كتسوية.",
    rows: entryRows(vatPaid),
  });

  const cfOpen = await db
    .select(entryCols)
    .from(financeEntries)
    .innerJoin(projects, eq(projects.id, financeEntries.projectId))
    .where(
      and(
        live,
        eq(financeEntries.cat, "cf"),
        eq(financeEntries.cfKind, ""),
        ne(financeEntries.status, "cancelled"),
      ),
    );
  checks.push({
    key: "cf_undecided",
    title: "بنود «الرسوم الإضافية» تنتظر تحديد نوعها",
    hint: "افتحوا القيد واختاروا: ضريبة العقد المحجوزة للهيئة، أم رسوم فعلية. يظهر ما يُعلَّم ضريبة في صفحة الضريبة.",
    rows: entryRows(cfOpen),
  });

  const noInvoice = await db
    .select(entryCols)
    .from(financeEntries)
    .innerJoin(projects, eq(projects.id, financeEntries.projectId))
    .where(
      and(
        live,
        eq(financeEntries.type, "expense"),
        eq(financeEntries.taxInvoice, false),
        ne(financeEntries.status, "cancelled"),
        notInArray(financeEntries.cat, [...NOT_PURCHASES]),
        sql`${financeEntries.amount} >= 100000`,
      ),
    );
  checks.push({
    key: "no_tax_invoice",
    title: "مشتريات من 1,000 ر.س فأكثر بلا فاتورة ضريبية",
    hint: "إن كان لها فاتورة ضريبية فسجّلوها في القيد لتُخصم ضريبتها من المستحق للهيئة.",
    rows: entryRows(noInvoice),
  });

  // Drafts are left out of every figure; say so, with what each one already holds.
  const drafts = await db
    .select({
      id: projects.id,
      number: projects.number,
      name: projects.name,
      gross: sql<number>`${contractTotalSql("projects")}`,
      received: sql<number>`COALESCE((SELECT SUM(r.amount_halalas) FROM project_receipts r
        WHERE r.project_id = projects.id), 0)`,
      entries: sql<number>`(SELECT COUNT(*) FROM finance_entries e
        WHERE e.project_id = projects.id AND e.status <> 'cancelled')`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.orgId, orgId),
        isNull(projects.archivedAt),
        eq(projects.external, false),
        eq(projects.status, "draft"),
      ),
    );
  checks.push({
    key: "drafts",
    title: "مشاريع مسودة لا تُحسب في المالية",
    hint: "المسودة لا تدخل في أي رقم مالي: الأرباح والضريبة والتحصيل والمستهدف. غيّروا حالتها إلى «جاري التنفيذ» إن بدأ العمل فيها، أو ألغوها إن لم تعد قائمة.",
    rows: drafts.map((p) => {
      const parts = [`العقد ${sar(Number(p.gross))}`];
      if (Number(p.received)) parts.push(`فيها استلامات ${sar(Number(p.received))}`);
      if (Number(p.entries)) parts.push(`${Number(p.entries)} قيد`);
      return {
        label: `${p.number} · ${p.name}`,
        detail: parts.join(" · "),
        link: projectLink(p.id),
      };
    }),
  });

  // Cancelled: what was received counts, the instalments still pending are not expected any more.
  const leftover = await db
    .select({
      id: projects.id,
      number: projects.number,
      name: projects.name,
      n: sql<number>`count(*)`,
      amount: sql<number>`sum(${paymentSchedule.amount})`,
    })
    .from(paymentSchedule)
    .innerJoin(projects, eq(projects.id, paymentSchedule.projectId))
    .where(and(live, eq(projects.status, "cancelled"), eq(paymentSchedule.status, "pending")))
    .groupBy(projects.id);
  checks.push({
    key: "cancelled_instalments",
    title: "مشاريع ملغاة لها دفعات مجدولة معلّقة",
    hint: "لا تُحسب في التحصيل ولا في التدفق النقدي. احذفوها من جدول الدفعات في المشروع، أو أعيدوا المشروع إلى «جاري التنفيذ» إن كان العميل سيدفعها.",
    rows: leftover.map((p) => ({
      label: `${p.number} · ${p.name}`,
      detail: `${Number(p.n)} دفعة · ${sar(Number(p.amount))}`,
      link: projectLink(p.id),
    })),
  });

  return checks.filter((c) => c.rows.length);
}
