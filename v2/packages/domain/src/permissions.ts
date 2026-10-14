/* ─────────────────────────────────────────────────────────────────────────────
 * Permissions: a fixed registry of «module.action» keys, eight ready-made roles, and the
 * rules for combining a role with the organisation's own edits. Pure: no I/O.
 * ──────────────────────────────────────────────────────────────────────────── */

export const ACTIONS = {
  view: "عرض",
  edit: "تعديل",
  archive: "أرشفة",
  delete: "حذف",
  share: "مشاركة",
  profit: "إظهار الأرباح",
  manage: "إدارة",
  run: "تنفيذ",
} as const;
export type ActionKey = keyof typeof ACTIONS;

export type PermModule = { key: string; label: string; hint: string; actions: ActionKey[] };

/** Rows of the permission table, in the order the owner sees them. */
export const PERM_MODULES: PermModule[] = [
  {
    key: "clients",
    label: "العملاء",
    hint: "ملفات العملاء وجهات الاتصال",
    actions: ["view", "edit", "archive", "delete"],
  },
  {
    key: "projects",
    label: "المشاريع",
    hint: "المشاريع وبياناتها",
    actions: ["view", "edit", "archive", "delete"],
  },
  {
    key: "documents",
    label: "المستندات",
    hint: "العقود والعروض والخطابات",
    actions: ["view", "edit", "share"],
  },
  {
    key: "finance",
    label: "مالية المشروع",
    hint: "مصروفات وإيرادات ودفعات كل مشروع",
    actions: ["view", "edit", "profit"],
  },
  {
    key: "treasury",
    label: "المالية العامة",
    hint: "الشركة والشركاء والتوزيعات والتقارير",
    actions: ["view", "edit"],
  },
  {
    key: "vat",
    label: "ضريبة القيمة المضافة",
    hint: "إقرار الضريبة الربع سنوي",
    actions: ["view", "edit"],
  },
  {
    key: "products",
    label: "المنتجات والخدمات",
    hint: "العروض والتسعير الداخلي",
    actions: ["view", "edit"],
  },
  { key: "sales", label: "المبيعات", hint: "طلبات العملاء والمتابعة", actions: ["view", "edit"] },
  { key: "site", label: "الموقع", hint: "محتوى الموقع العام والنشر", actions: ["view", "edit"] },
  { key: "assets", label: "الملفات والشعارات", hint: "رفع الشعارات والصور", actions: ["edit"] },
  { key: "org", label: "بيانات المنشأة", hint: "الاسم والترقيم والإعدادات", actions: ["edit"] },
  { key: "import", label: "الاستيراد", hint: "استيراد بيانات النسخة القديمة", actions: ["run"] },
  {
    key: "plans",
    label: "الخطط",
    hint: "الخطة الاستراتيجية والتشغيلية",
    actions: ["view", "edit"],
  },
  { key: "team", label: "الفريق", hint: "المستخدمون والدعوات", actions: ["view", "manage"] },
  { key: "roles", label: "الأدوار والصلاحيات", hint: "تعديل جدول الصلاحيات", actions: ["manage"] },
  { key: "audit", label: "سجل النشاط", hint: "من فعل ماذا ومتى", actions: ["view"] },
];

export const ALL_PERMS: string[] = PERM_MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}.${a}`),
);
const PERM_SET = new Set(ALL_PERMS);
export const isPerm = (k: string) => PERM_SET.has(k);

/** Which projects a person sees: everything, their team's (today's default), or only their own. */
export const SCOPES = ["all", "team", "mine"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABELS: Record<Scope, string> = {
  all: "كل المشاريع",
  team: "مشاريع الفريق",
  mine: "مشاريعي فقط",
};
export const SCOPED_MODULES = ["projects"] as const;
export type Scopes = Partial<Record<(typeof SCOPED_MODULES)[number], Scope>>;

export type RoleDef = {
  key: string;
  name: string;
  description: string;
  perms: string[];
  scopes: Scopes;
};

const except = (...drop: string[]) => ALL_PERMS.filter((p) => !drop.includes(p));
const only = (...keep: string[]) => ALL_PERMS.filter((p) => keep.includes(p));
const mod = (m: string) => ALL_PERMS.filter((p) => p.startsWith(`${m}.`));
const BASE = ["clients.view", "projects.view", "documents.view"];
const OWNER_ONLY = ["projects.delete", "clients.delete", "import.run", "roles.manage"];

export const OWNER_KEY = "owner";
export const DEFAULT_ROLES: RoleDef[] = [
  {
    key: "owner",
    name: "المالك",
    description: "كل شيء، ولا يمكن تقييده.",
    perms: ALL_PERMS,
    scopes: { projects: "all" },
  },
  {
    key: "general-manager",
    name: "المدير العام",
    description: "إدارة العمل كاملة عدا الحذف النهائي والاستيراد وتعديل الأدوار.",
    perms: except(...OWNER_ONLY),
    scopes: { projects: "all" },
  },
  {
    key: "finance-manager",
    name: "المدير المالي",
    description: "المالية والضريبة والشركاء مع اطلاع على المشاريع والعملاء.",
    perms: [
      ...BASE,
      "clients.edit",
      "documents.edit",
      "documents.share",
      ...mod("finance"),
      ...mod("treasury"),
      ...mod("vat"),
      "audit.view",
      "team.view",
      "plans.view",
    ],
    scopes: { projects: "all" },
  },
  {
    key: "project-manager",
    name: "مدير مشاريع",
    description: "يدير العملاء والمشاريع ومالية المشروع دون أرباح الشركة.",
    perms: [
      ...BASE,
      "clients.edit",
      "clients.archive",
      "projects.edit",
      "projects.archive",
      "documents.edit",
      "documents.share",
      "finance.view",
      "finance.edit",
      "finance.profit",
      "products.view",
      "sales.view",
      "team.view",
      "plans.view",
    ],
    scopes: { projects: "all" },
  },
  {
    key: "sales",
    name: "مبيعات وعلاقات عملاء",
    description: "العملاء والطلبات والعروض، بلا أرقام الأرباح.",
    perms: [
      ...BASE,
      "clients.edit",
      "projects.edit",
      "documents.edit",
      "documents.share",
      "finance.view",
      "products.view",
      ...mod("sales"),
      "site.view",
    ],
    scopes: { projects: "all" },
  },
  {
    key: "accountant",
    name: "محاسب",
    description: "إدخال المصروفات والمقبوضات والضريبة دون تعديل العقود.",
    perms: [
      ...BASE,
      "finance.view",
      "finance.edit",
      "finance.profit",
      ...mod("treasury"),
      ...mod("vat"),
    ],
    scopes: { projects: "all" },
  },
  {
    key: "team-member",
    name: "عضو فريق",
    description: "يعمل على مشاريع الفريق ويرى ماليتها دون الأرباح.",
    perms: [...BASE, "clients.edit", "projects.edit", "finance.view"],
    scopes: { projects: "team" },
  },
  {
    key: "viewer",
    name: "مشاهد",
    description: "قراءة فقط.",
    perms: only(...BASE),
    scopes: { projects: "team" },
  },
];

/** The role an existing account has before anyone assigns one (v1 owner/admin/member). */
export const LEGACY_ROLE_KEY: Record<string, string> = {
  owner: "owner",
  admin: "general-manager",
  member: "team-member",
};

/** An organisation's edit of a default role, or a role it created. */
export type RoleRow = {
  key: string;
  name: string;
  description: string;
  perms: string[];
  scopes: Scopes;
};

export function defaultRole(key: string): RoleDef | undefined {
  return DEFAULT_ROLES.find((r) => r.key === key);
}

/** Overrides win over the ready-made definition; the owner role can never be overridden. */
export function resolveRole(key: string, overrides: RoleRow[]): RoleDef | undefined {
  const base = defaultRole(key);
  if (key === OWNER_KEY) return base;
  const row = overrides.find((r) => r.key === key);
  if (row)
    return {
      key,
      name: row.name,
      description: row.description,
      perms: sanitize(row.perms),
      scopes: row.scopes,
    };
  return base;
}

/** Every role the organisation has: ready-made (with edits applied) plus its own. */
export function allRoles(overrides: RoleRow[]): RoleDef[] {
  const out = DEFAULT_ROLES.map((r) => resolveRole(r.key, overrides) as RoleDef);
  for (const r of overrides)
    if (!defaultRole(r.key)) out.push(resolveRole(r.key, overrides) as RoleDef);
  return out;
}

export const sanitize = (perms: string[]) => [...new Set(perms.filter(isPerm))];

/** A person's role key: the one assigned, else the one their legacy role maps to. */
export const effectiveRoleKey = (assigned: string, legacy: string) =>
  assigned || LEGACY_ROLE_KEY[legacy] || "viewer";

export function can(perms: readonly string[], key: string): boolean {
  return perms.includes(key);
}

/** Dropping `view` of a module while keeping its other actions makes no sense: edits imply view. */
export function normalizePerms(perms: string[]): string[] {
  const out = new Set(sanitize(perms));
  for (const p of [...out]) {
    const [m, a] = p.split(".");
    if (a && a !== "view" && isPerm(`${m}.view`) && a !== "run") out.add(`${m}.view`);
  }
  return [...out];
}

/** What a role may do, as short Arabic lines for «ما يراه هذا الدور». */
export function describeRole(perms: readonly string[]): string[] {
  const lines: string[] = [];
  for (const m of PERM_MODULES) {
    const have = m.actions.filter((a) => perms.includes(`${m.key}.${a}`));
    if (have.length) lines.push(`${m.label}: ${have.map((a) => ACTIONS[a]).join("، ")}`);
  }
  return lines;
}

/** Keys of the people-and-money fields that need their own switch. */
export const SENSITIVE_PERMS = ["finance.profit"] as const;

/** Whether an actor may change another account's role: only the owner touches owners. */
export function canAssignRole(actorKey: string, targetRoleKey: string) {
  return targetRoleKey !== OWNER_KEY || actorKey === OWNER_KEY;
}
