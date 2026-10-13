import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Info,
  Menu,
  Notice,
  Tabs,
} from "../../components/ui";
import { fromEpoch, money } from "../../lib/format";
import { meQuery } from "../../session";
import {
  CLIENT_TYPE_LABELS,
  label,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  STATUS_TONE,
} from "../labels";
import { projectKeys } from "../projects/api";
import { ProjectDialog } from "../projects/ProjectDialog";
import { archiveClient, clientKeys, clientQuery, deleteClient } from "./api";
import { ClientDialog } from "./ClientDialog";

const route = getRouteApi("/clients/$id");

export function ClientPage() {
  const { id } = route.useParams();
  const { tab = "overview" } = route.useSearch();
  const nav = route.useNavigate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useQuery(meQuery).data;
  const q = useQuery(clientQuery(id));
  const [editing, setEditing] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (q.isPending) return <p className="text-muted">جارٍ التحميل…</p>;
  if (q.isError || !q.data)
    return (
      <EmptyState
        title="العميل غير موجود"
        action={
          <Link to="/clients" className="text-brand underline">
            العودة إلى العملاء
          </Link>
        }
      />
    );

  const { client, contacts, projects } = q.data;
  const manager = me?.role === "owner" || me?.role === "admin";
  const live = projects.filter((p) => !p.archivedAt);
  const totalValue = live.reduce((a, p) => a + p.contractTotal, 0);
  const byStatus = live.reduce<Record<string, number>>(
    (a, p) => ({ ...a, [p.status]: (a[p.status] ?? 0) + 1 }),
    {},
  );
  const sig = contacts.find((c) => c.isSignatory);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: clientKeys.all }),
      qc.invalidateQueries({ queryKey: projectKeys.all }),
    ]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try {
      await fn();
      await refresh();
      after?.();
    } catch (x) {
      const code = (x as { body?: { error?: string } }).body?.error;
      setError(
        code === "has_projects"
          ? "لا يمكن حذف عميل له مشاريع. استخدموا الأرشفة بدلاً من ذلك."
          : "تعذّر تنفيذ العملية",
      );
    }
  };

  const menu = [
    ...(manager
      ? [
          client.archivedAt
            ? {
                label: "استعادة العميل ومشاريعه",
                onSelect: () => act(() => archiveClient(client.id, true)),
              }
            : {
                label: "أرشفة العميل ومشاريعه",
                onSelect: () => {
                  if (
                    confirm(
                      `أرشفة «${client.name}» و${live.length} من مشاريعه؟ يمكن استعادتها لاحقاً.`,
                    )
                  )
                    act(() => archiveClient(client.id));
                },
              },
        ]
      : []),
    ...(me?.role === "owner" && projects.length === 0
      ? [
          {
            label: "حذف نهائي",
            danger: true,
            onSelect: () => {
              const typed = prompt(`للحذف النهائي اكتبوا اسم العميل: ${client.name}`);
              if (typed?.trim() === client.name)
                act(
                  () => deleteClient(client.id),
                  () => navigate({ to: "/clients" }),
                );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <nav className="mb-4 text-sm text-muted">
        <Link to="/clients" className="hover:text-ink">
          العملاء
        </Link>{" "}
        / <span className="text-ink">{client.name}</span>
      </nav>
      {error && <Notice>{error}</Notice>}
      {client.archivedAt && (
        <Notice tone="amber">هذا العميل مؤرشف منذ {fromEpoch(client.archivedAt)}.</Notice>
      )}

      <Card className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={client.name} logo={client.logo} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span dir="ltr">{client.code}</span>
            <Badge>{label(CLIENT_TYPE_LABELS, client.type)}</Badge>
            {client.city && <span>{client.city}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> تعديل
          </Button>
          {!client.archivedAt && (
            <Button onClick={() => setAddingProject(true)}>
              <Plus className="size-4" /> مشروع جديد
            </Button>
          )}
          <Menu items={menu} />
        </div>
      </Card>

      <Tabs
        items={[
          {
            to: "",
            label: "نظرة عامة",
            active: tab === "overview",
            onClick: () => nav({ search: { tab: "overview" }, replace: true }),
          },
          {
            to: "",
            label: `المشاريع (${live.length})`,
            active: tab === "projects",
            onClick: () => nav({ search: { tab: "projects" }, replace: true }),
          },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <h2 className="mb-4 font-semibold">بيانات العميل</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Info
                label="البريد الإلكتروني"
                value={
                  client.email && (
                    <a href={`mailto:${client.email}`} dir="ltr" className="text-brand">
                      {client.email}
                    </a>
                  )
                }
              />
              <Info
                label="رقم الهاتف"
                value={
                  client.phone && (
                    <a href={`tel:${client.phone}`} dir="ltr">
                      {client.phone}
                    </a>
                  )
                }
              />
              <Info label="رقم السجل / الترخيص" value={<span dir="ltr">{client.regNo}</span>} />
              <Info label="الرقم الضريبي" value={<span dir="ltr">{client.taxNo}</span>} />
              <Info label="العنوان الوطني" value={client.address} />
              <Info
                label="الموقع الإلكتروني"
                value={
                  client.website && (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      dir="ltr"
                      className="text-brand"
                    >
                      {client.website}
                    </a>
                  )
                }
              />
              <Info
                label="الممثل المفوض"
                value={sig && `${sig.name}${sig.title ? ` — ${sig.title}` : ""}`}
              />
              <Info label="تاريخ الإضافة" value={fromEpoch(client.createdAt)} />
            </dl>
            {contacts.some((c) => !c.isSignatory) && (
              <>
                <h3 className="mt-6 mb-2 text-sm font-semibold">جهات اتصال إضافية</h3>
                <ul className="divide-y rounded-lg border text-sm">
                  {contacts
                    .filter((c) => !c.isSignatory)
                    .map((c) => (
                      <li key={c.id} className="flex flex-wrap justify-between gap-2 p-3">
                        <span>
                          {c.name}
                          {c.title && <span className="text-muted"> — {c.title}</span>}
                        </span>
                        <span dir="ltr" className="text-muted">
                          {c.phone || c.email}
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
            {client.notes && (
              <>
                <h3 className="mt-6 mb-2 text-sm font-semibold">ملاحظات</h3>
                <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
              </>
            )}
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">ملخص المشاريع</h2>
            <p className="text-3xl font-bold">{live.length}</p>
            <p className="text-sm text-muted">مشروع · {money(totalValue)} قيمة العقود</p>
            <ul className="mt-4 space-y-2 text-sm">
              {Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) =>
                byStatus[k] ? (
                  <li key={k} className="flex justify-between">
                    <Badge tone={STATUS_TONE[k]}>{l}</Badge>
                    <span>{byStatus[k]}</span>
                  </li>
                ) : null,
              )}
            </ul>
          </Card>
        </div>
      ) : live.length === 0 ? (
        <EmptyState
          title="لا توجد مشاريع لهذا العميل"
          action={
            !client.archivedAt && (
              <Button onClick={() => setAddingProject(true)}>
                <Plus className="size-4" /> مشروع جديد
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {live.map((p) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-brand">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">
                    <span dir="ltr">{p.number}</span> · {label(PROJECT_TYPE_LABELS, p.type)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {p.expectedValue > 0 && (
                    <span className="text-muted">{money(p.expectedValue)}</span>
                  )}
                  <Badge tone={STATUS_TONE[p.status]}>
                    {label(PROJECT_STATUS_LABELS, p.status)}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ClientDialog open={editing} onOpenChange={setEditing} existing={q.data} />
      <ProjectDialog open={addingProject} onOpenChange={setAddingProject} clientId={client.id} />
    </>
  );
}
