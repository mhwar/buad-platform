import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Plus, UserCog } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Menu,
  type MenuItem,
  Notice,
  Segmented,
  Select,
} from "../../components/ui";
import { ApiError, ago } from "../../lib/format";
import { useCan } from "../../session";
import { send, type TeamUser, teamRolesQuery, teamUsersQuery } from "./queries";
import { RolesPanel } from "./RolesPanel";

const ERRORS: Record<string, string> = {
  email_taken: "هذا البريد مسجّل لدينا بالفعل.",
  last_owner: "لا يمكن إيقاف آخر مالك أو تغيير دوره.",
  forbidden: "هذا الإجراء للمالك فقط.",
  role_not_found: "الدور غير موجود.",
};
const msg = (e: unknown) =>
  ERRORS[(e as ApiError).body?.error as string] ?? "تعذّر الحفظ، حاول مرة أخرى.";

/** «الفريق والصلاحيات»: who can sign in, with which role, and what each role may do. */
export function TeamPage() {
  const can = useCan();
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <div className="space-y-5">
      {can("roles.manage") || can("team.view") ? (
        <Segmented
          label="الفريق"
          value={tab}
          onChange={setTab}
          items={[
            { value: "users", label: "المستخدمون" },
            { value: "roles", label: "الأدوار والصلاحيات" },
          ]}
        />
      ) : null}
      {tab === "users" ? <UsersPanel /> : <RolesPanel />}
    </div>
  );
}

function UsersPanel() {
  const can = useCan();
  const qc = useQueryClient();
  const users = useQuery(teamUsersQuery);
  const roles = useQuery(teamRolesQuery);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const manage = can("team.manage");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team-users"] });
    qc.invalidateQueries({ queryKey: ["team-roles"] });
  };

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(msg(e));
    }
  };
  const reset = (u: TeamUser) =>
    act(async () => {
      const r = await send<{ setupToken: string }>("POST", `/api/team/users/${u.id}/reset`);
      setLink({ name: u.name, url: `${window.location.origin}/login?token=${r.setupToken}` });
    });

  const menu = (u: TeamUser): MenuItem[] => [
    { label: "تغيير الدور أو الاسم", onSelect: () => setEditing(u) },
    { label: "رابط تعيين كلمة مرور", onSelect: () => reset(u) },
    "separator",
    u.active
      ? {
          label: "إيقاف الحساب",
          danger: true,
          onSelect: () => act(() => send("PATCH", `/api/team/users/${u.id}`, { active: false })),
        }
      : {
          label: "إعادة التفعيل",
          onSelect: () => act(() => send("PATCH", `/api/team/users/${u.id}`, { active: true })),
        },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {users.data ? `${users.data.filter((u) => u.active).length} مستخدم نشط` : ""}
        </p>
        {manage && (
          <Button onClick={() => setInviting(true)}>
            <Plus className="size-4" />
            دعوة مستخدم
          </Button>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
      {users.data?.length === 0 && <EmptyState title="لا مستخدمين بعد" />}
      <div className="grid gap-3 md:grid-cols-2">
        {users.data?.map((u) => (
          <Card key={u.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold">{u.name || u.email}</p>
              <p dir="ltr" className="truncate text-end text-xs text-muted">
                {u.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{u.roleName}</Badge>
                {!u.active ? (
                  <Badge tone="red">موقوف</Badge>
                ) : u.pending ? (
                  <Badge tone="amber">بانتظار التفعيل</Badge>
                ) : (
                  <Badge tone="green">نشط</Badge>
                )}
                <span className="text-xs text-muted">
                  {u.lastLoginAt ? `آخر دخول ${ago(u.lastLoginAt)}` : "لم يسجّل دخولاً"}
                </span>
              </div>
            </div>
            {manage && <Menu items={menu(u)} label={`خيارات ${u.name}`} />}
          </Card>
        ))}
      </div>

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        roles={roles.data ?? []}
        onDone={(name, url) => {
          setInviting(false);
          setLink({ name, url });
          refresh();
        }}
      />
      {editing && (
        <EditDialog
          user={editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      <Dialog open={!!link} onOpenChange={(o) => !o && setLink(null)} title="رابط التفعيل">
        {link && <LinkBox name={link.name} url={link.url} />}
      </Dialog>
    </div>
  );
}

function LinkBox({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        أرسل هذا الرابط إلى {name} ليختار كلمة مروره. صالح لمدة 7 أيام ويُستخدم مرة واحدة.
      </p>
      <input
        readOnly
        dir="ltr"
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border bg-canvas px-3 py-2 text-xs"
        aria-label="رابط التفعيل"
      />
      <Button
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "تم النسخ" : "نسخ الرابط"}
      </Button>
    </div>
  );
}

function RoleSelect({
  roles,
  value,
  onChange,
  canOwner,
}: {
  roles: { key: string; name: string; description: string }[];
  value: string;
  onChange: (v: string) => void;
  canOwner: boolean;
}) {
  const current = roles.find((r) => r.key === value);
  return (
    <Field label="الدور" hint={current?.description}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {roles
          .filter((r) => canOwner || r.key !== "owner")
          .map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}

function InviteDialog({
  open,
  onClose,
  roles,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  roles: { key: string; name: string; description: string }[];
  onDone: (name: string, url: string) => void;
}) {
  const can = useCan();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("team-member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await send<{ setupToken: string }>("POST", "/api/team/users", {
        name,
        email,
        roleKey,
      });
      onDone(name, `${window.location.origin}/login?token=${r.setupToken}`);
      setName("");
      setEmail("");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="دعوة مستخدم">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="البريد الإلكتروني">
          <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <RoleSelect
          roles={roles}
          value={roleKey}
          onChange={setRoleKey}
          canOwner={can("roles.manage")}
        />
        <Button
          disabled={busy || !name.trim() || !email.includes("@")}
          onClick={submit}
          className="w-full"
        >
          إنشاء الدعوة
        </Button>
      </div>
    </Dialog>
  );
}

function EditDialog({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: TeamUser;
  roles: { key: string; name: string; description: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const can = useCan();
  const [name, setName] = useState(user.name);
  const [roleKey, setRoleKey] = useState(user.roleKey);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await send("PATCH", `/api/team/users/${user.id}`, { name, roleKey });
      onSaved();
    } catch (e) {
      setError(msg(e));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="تعديل المستخدم">
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <Field label="الاسم">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <RoleSelect
          roles={roles}
          value={roleKey}
          onChange={setRoleKey}
          canOwner={can("roles.manage")}
        />
        <Button disabled={!name.trim()} onClick={save} className="w-full">
          <UserCog className="size-4" />
          حفظ
        </Button>
      </div>
    </Dialog>
  );
}
