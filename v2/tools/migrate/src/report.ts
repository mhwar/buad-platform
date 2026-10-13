import type { Plan } from "./plan";

const kindAr = { user: "مستخدم بُعد", org: "جمعية", org_member: "عضو جمعية" } as const;

export function toReport(plan: Plan): string {
  const byRole = (r: string) => plan.users.filter((u) => u.role === r).length;
  const pending = plan.users.filter((u) => u.mustChangePass).length;
  const lines = [
    "# تقرير نقل بيانات الهوية من v1",
    "",
    `- جهات (جمعيات + بُعد): **${plan.orgs.length}**`,
    `- مستخدمون سيُنقلون: **${plan.users.length}** (مالك ${byRole("owner")} · مدير ${byRole("admin")} · عضو ${byRole("member")})`,
    `- بانتظار تعيين كلمة مرور عند أول دخول: **${pending}**`,
    `- مرفوض ويحتاج تصحيحاً يدوياً: **${plan.rejects.length}**`,
    "",
  ];
  if (plan.rejects.length) {
    lines.push(
      "## المرفوض",
      "",
      "| النوع | المعرّف | الاسم | البريد | السبب |",
      "|---|---|---|---|---|",
    );
    for (const r of plan.rejects) {
      lines.push(
        `| ${kindAr[r.kind]} | ${r.id} | ${r.name || "—"} | ${r.email || "—"} | ${r.reason} |`,
      );
    }
    lines.push("");
  }
  const inv = Object.entries(plan.inventory);
  if (inv.length) {
    lines.push(
      "## محتوى مساحة العمل (يُنقل وحدة بوحدة لاحقاً)",
      "",
      "| القسم | الحجم |",
      "|---|---|",
    );
    for (const [k, v] of inv) lines.push(`| ${k} | ${v} |`);
    lines.push("");
  }
  return lines.join("\n");
}
