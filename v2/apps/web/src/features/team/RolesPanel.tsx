import {
  ACTIONS,
  type ActionKey,
  describeRole,
  normalizePerms,
  PERM_MODULES,
  SCOPE_LABELS,
  type Scope,
} from "@buad/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Select,
} from "../../components/ui";
import { ApiError } from "../../lib/format";
import { useCan } from "../../session";
import { send, type TeamRole, teamRolesQuery } from "./queries";

const ERRORS: Record<string, string> = {
  role_in_use: "لا يمكن حذف دور مرتبط بمستخدمين. غيّر أدوارهم أولاً.",
  key_taken: "هذا المعرّف مستخدم.",
  owner_fixed: "دور المالك ثابت ولا يمكن تعديله.",
};
const msg = (e: unknown) =>
  ERRORS[(e as ApiError).body?.error as string] ?? "تعذّر الحفظ، حاول مرة أخرى.";

type Draft = { name: string; description: string; perms: string[]; scope: Scope };
const toDraft = (r: TeamRole): Draft => ({
  name: r.name,
  description: r.description,
  perms: r.perms,
  scope: r.scopes.projects ?? "team",
});

/** The permission cards under four headings, so related ones sit together. */
const GROUPS: [label: string, keys: string[]][] = [
  ["العمل اليومي", ["clients", "projects", "documents", "tasks", "meetings"]],
  ["المالية", ["finance", "treasury", "vat"]],
  ["المبيعات والتخطيط", ["sales", "products", "site", "plans"]],
  ["الإدارة", ["team", "roles", "audit", "org", "assets", "import"]],
];
const PERM_GROUPS = [
  ...GROUPS.map(([label, keys]) => ({
    label,
    modules: keys.flatMap((k) => PERM_MODULES.filter((m) => m.key === k)),
  })),
  // Anything added to the registry later still shows, under «أخرى».
  {
    label: "أخرى",
    modules: PERM_MODULES.filter((m) => !GROUPS.some(([, keys]) => keys.includes(m.key))),
  },
].filter((g) => g.modules.length);

/** The permission table: pick a role, tick what it may do. Edits apply to everyone in that role. */
export function RolesPanel() {
  const can = useCan();
  const qc = useQueryClient();
  const roles = useQuery(teamRolesQuery);
  const [key, setKey] = useState("team-member");
  const role = roles.data?.find((r) => r.key === key) ?? roles.data?.[0];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const edit = can("roles.manage");
  const fixed = role?.key === "owner";

  useEffect(() => {
    if (role) {
      setDraft(toDraft(role));
      setSaved(false);
      setError("");
    }
  }, [role]);

  if (!role || !draft) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["team-roles"] });
  const toggle = (perm: string, on: boolean) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          perms: on
            ? normalizePerms([...d.perms, perm])
            : d.perms.filter(
                (p) =>
                  p !== perm && !(perm.endsWith(".view") && p.startsWith(perm.split(".")[0] + ".")),
              ),
        },
    );
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(role));
  const save = async () => {
    setError("");
    try {
      await send("PUT", `/api/team/roles/${role.key}`, {
        name: draft.name,
        description: draft.description,
        perms: draft.perms,
        scopes: { projects: draft.scope },
      });
      setSaved(true);
      refresh();
    } catch (e) {
      setError(msg(e));
    }
  };
  const remove = async () => {
    setError("");
    try {
      await send("DELETE", `/api/team/roles/${role.key}`);
      setKey("team-member");
      refresh();
    } catch (e) {
      setError(msg(e));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {roles.data?.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setKey(r.key)}
              aria-pressed={r.key === role.key}
              className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-start text-sm transition ${
                r.key === role.key
                  ? "border-brand bg-brand-soft font-semibold text-brand"
                  : "bg-surface hover:bg-brand-soft"
              }`}
            >
              <span className="flex items-center gap-2">
                {r.name}
                {r.key === "owner" && <Lock className="size-3.5" />}
              </span>
              <span className="block text-xs font-normal text-muted">{r.users} مستخدم</span>
            </button>
          ))}
        </div>
        {edit && (
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            دور جديد
          </Button>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        {error && <Notice>{error}</Notice>}
        {saved && !dirty && (
          <Notice tone="blue">تم الحفظ. تسري التغييرات فوراً على كل من له هذا الدور.</Notice>
        )}
        {fixed && <Notice tone="blue">دور المالك ثابت: كل الصلاحيات، ولا يمكن تقييده.</Notice>}
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم الدور">
              <Input
                value={draft.name}
                disabled={!edit || fixed}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="المشاريع التي يراها">
              <Select
                value={draft.scope}
                disabled={!edit || fixed}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value as Scope })}
              >
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="وصف مختصر" className="sm:col-span-2">
              <Input
                value={draft.description}
                disabled={!edit || fixed}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        {PERM_GROUPS.map(({ label: group, modules }) => (
          <section key={group} aria-label={group} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted">{group}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {modules.map((m) => (
                <Card key={m.key} className="p-4">
                  <p className="font-semibold">{m.label}</p>
                  <p className="mb-2 text-xs text-muted">{m.hint}</p>
                  <div className="flex flex-wrap gap-2">
                    {m.actions.map((a: ActionKey) => {
                      const perm = `${m.key}.${a}`;
                      const on = draft.perms.includes(perm);
                      return (
                        <label
                          key={a}
                          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm sm:min-h-9 ${
                            on ? "border-brand bg-brand-soft text-brand" : "text-muted"
                          } ${!edit || fixed ? "opacity-70" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--color-brand)]"
                            checked={on}
                            disabled={!edit || fixed}
                            onChange={(e) => toggle(perm, e.target.checked)}
                          />
                          {ACTIONS[a]}
                        </label>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

        <Card>
          <p className="mb-2 font-semibold">ما يراه ويفعله هذا الدور</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
            {describeRole(draft.perms).map((l) => (
              <li key={l}>{l}</li>
            ))}
            {draft.perms.includes("finance.view") && !draft.perms.includes("finance.profit") && (
              <li>أرقام الأرباح مخفية عنه.</li>
            )}
          </ul>
        </Card>

        {edit && !fixed && (
          <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-surface/95 p-3 backdrop-blur lg:bottom-0">
            <Button disabled={!dirty || !draft.name.trim()} onClick={save}>
              حفظ الدور
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(toDraft(role))}>
                تراجع
              </Button>
            )}
            {role.builtin ? (
              role.edited && (
                <Button variant="ghost" onClick={remove}>
                  إعادة للوضع الجاهز
                </Button>
              )
            ) : (
              <Button variant="danger" onClick={remove}>
                حذف الدور
              </Button>
            )}
            {role.builtin && <Badge>{role.edited ? "معدّل" : "جاهز"}</Badge>}
          </div>
        )}
      </div>

      {creating && (
        <NewRole
          base={role}
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setKey(k);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewRole({
  base,
  onClose,
  onCreated,
}: {
  base: TeamRole;
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const create = async () => {
    const key = `r-${Date.now().toString(36)}`;
    try {
      await send("POST", "/api/team/roles", {
        key,
        name,
        description: "",
        perms: base.perms,
        scopes: base.scopes,
      });
      onCreated(key);
    } catch (e) {
      setError(msg(e));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="دور جديد"
      footer={
        <DialogActions onCancel={onClose}>
          <Button disabled={!name.trim()} onClick={create}>
            إنشاء
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <p className="text-sm text-muted">
          يبدأ بنسخة من صلاحيات «{base.name}» ثم تعدّلها كما تشاء.
        </p>
        <Field label="اسم الدور">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
