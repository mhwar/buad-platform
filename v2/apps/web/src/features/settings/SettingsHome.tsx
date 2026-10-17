import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";
import { Card, PageHeader } from "../../components/ui";
import { sar } from "../../lib/format";
import { useCan } from "../../session";
import { vatSettingsQuery } from "../finance-overview/vat-api";
import { missingFields, ORG_FIELDS } from "../org/completeness";
import { orgProfileQuery } from "../org/OrgSettings";
import { teamUsersQuery } from "../team/queries";
import { yearReviewQuery } from "../year-review/api";
import { SETTINGS_ICONS } from "./SettingsLayout";

/** «الإعدادات»: every section on one page, with what each still lacks. */
export function SettingsHome() {
  const can = useCan();
  const year = new Date().getFullYear();
  const org = useQuery(orgProfileQuery);
  const finance = can("treasury.view");
  const target = useQuery({ ...yearReviewQuery(year), enabled: finance });
  const vat = useQuery({ ...vatSettingsQuery, enabled: finance });
  const users = useQuery({ ...teamUsersQuery, enabled: can("team.view") });

  const gaps = org.data ? missingFields(org.data, ORG_FIELDS) : null;
  const filled = gaps ? ORG_FIELDS.length - gaps.length : 0;
  const goal = target.data?.totals.target;
  const active = users.data?.filter((u) => u.active).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="الإعدادات"
        subtitle="ما يُضبط مرة واحدة ويظهر في كل عقد وتقرير. ابدؤوا بما ينقص."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          k="org"
          to="/settings/org"
          title="بيانات الجهة"
          state={gaps ? (gaps.length ? "gap" : "ok") : undefined}
          meta={gaps ? `${filled} من ${ORG_FIELDS.length} مكتمل` : undefined}
        >
          {gaps?.length ? (
            <>
              <span className="font-medium text-ink">ما ينقص:</span> {gaps.join("، ")}
            </>
          ) : (
            "الاسم والأرقام الرسمية والمفوض والصور: تظهر في العقود والخطابات وكشوف الحساب."
          )}
        </Section>
        {finance && (
          <Section
            k="finance"
            to="/settings/finance"
            title="المالية"
            state={target.data ? (goal ? "ok" : "gap") : undefined}
            meta={vat.data ? `الضريبة ${vat.data.rate}%` : undefined}
          >
            {target.data &&
              (goal ? (
                <>
                  مستهدف {year}: <b className="text-ink tabular-nums">{sar(goal)}</b> (
                  {target.data.totals.targetSource === "settings" ? "من الإعدادات" : "من الخطة"}).
                </>
              ) : (
                <>
                  <span className="font-medium text-ink">ما ينقص:</span> مستهدف {year}. يُضبط من مؤشر
                  الإيراد في{" "}
                  <Link to="/plans" className="font-semibold text-brand underline">
                    خطة السنة
                  </Link>
                  .
                </>
              ))}{" "}
            الرصيد الافتتاحي، وشروط المشاريع الجديدة، والضريبة.
          </Section>
        )}
        {can("team.view") && (
          <Section
            k="team"
            to="/settings/team"
            title="الفريق والصلاحيات"
            meta={active === undefined ? undefined : `${active} مستخدم نشط`}
          >
            من يدخل المنصة، وبأي دور، وما يراه كل دور.
          </Section>
        )}
        {can("audit.view") && (
          <Section k="activity" to="/settings/activity" title="سجل النشاط">
            من غيّر ماذا ومتى، بالقيم قبل التعديل وبعده.
          </Section>
        )}
        {can("import.run") && (
          <Section k="import" to="/settings/import" title="الاستيراد">
            نقل العملاء والمشاريع من المنصة السابقة.
          </Section>
        )}
        <Section k="account" to="/settings/account" title="حسابي">
          كلمة المرور، ونمط الألوان على هذا الجهاز.
        </Section>
      </div>
    </div>
  );
}

function Section({
  k,
  to,
  search,
  title,
  meta,
  state,
  children,
}: {
  k: string;
  to: string;
  search?: Record<string, string>;
  title: string;
  meta?: string;
  /** Complete, or something is missing; nothing while it loads or for sections with no checklist. */
  state?: "ok" | "gap";
  children: ReactNode;
}) {
  const Icon = SETTINGS_ICONS[k] ?? LayoutGrid;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{title}</h2>
          {meta && (
            <p className="flex items-center gap-1 text-sm text-muted">
              {state === "ok" && (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              )}
              {state === "gap" && (
                <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
              )}
              {meta}
            </p>
          )}
        </div>
      </div>
      <p className="flex-1 text-sm text-muted">{children}</p>
      <Link
        to={to}
        search={search}
        className="self-start text-sm font-semibold text-brand hover:underline"
      >
        {state === "gap" ? "أكملوها" : "فتح"}
      </Link>
    </Card>
  );
}
