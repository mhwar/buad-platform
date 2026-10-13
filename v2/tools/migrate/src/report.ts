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
  const b = plan.business;
  const rejected = b.issues.filter((i) => i.severity === "rejected");
  const fixed = b.issues.filter((i) => i.severity === "fixed");
  lines.push(
    "## العملاء والمشاريع",
    "",
    `- عملاء سيُنقلون: **${b.clients.length}** (بأرقام CL-0001 … حسب تاريخ الإنشاء)`,
    `- مفوّضون بالتوقيع: **${b.contacts.length}**`,
    `- مشاريع ستُنقل: **${b.projects.length}**`,
    `- مرفوض: **${rejected.length}** · نُقل مع تصحيح: **${fixed.length}**`,
    "",
  );
  const kindAr2 = { client: "عميل", project: "مشروع" } as const;
  for (const [title, list] of [
    ["## المرفوض من العملاء والمشاريع", rejected],
    ["## نُقل مع تصحيح", fixed],
  ] as const) {
    if (!list.length) continue;
    lines.push(title, "", "| النوع | المعرّف | الاسم | السبب |", "|---|---|---|---|");
    for (const i of list)
      lines.push(`| ${kindAr2[i.kind]} | ${i.id} | ${i.name || "—"} | ${i.reason} |`);
    lines.push("");
  }
  return lines.join("\n");
}
