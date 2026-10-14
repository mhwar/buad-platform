import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Briefcase, FileUp, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader } from "./components/ui";
import { clientsQuery } from "./features/clients/api";
import { ClientDialog } from "./features/clients/ClientDialog";
import { label, PROJECT_STATUS_LABELS, STATUS_TONE } from "./features/labels";
import { projectsQuery } from "./features/projects/api";
import { ProjectDialog } from "./features/projects/ProjectDialog";
import { money } from "./lib/format";
import { meQuery } from "./session";

export function Home() {
  const me = useQuery(meQuery).data;
  const clients = useQuery(clientsQuery({}));
  const projects = useQuery(projectsQuery({}));
  const [newClient, setNewClient] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const pc = projects.data?.counts ?? {};
  const clientCount = Object.values(clients.data?.counts ?? {}).reduce((a, b) => a + b, 0);
  const activeValue = (projects.data?.items ?? [])
    .filter((p) => p.status === "active")
    .reduce((a, p) => a + p.contractTotal, 0);
  const recent = (projects.data?.items ?? []).slice(0, 6);

  return (
    <>
      <PageHeader
        title={`أهلاً ${me?.name ?? ""}`}
        subtitle="ملخص العملاء والمشاريع"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewClient(true)}>
              <Plus className="size-4" /> عميل جديد
            </Button>
            <Button onClick={() => setNewProject(true)}>
              <Plus className="size-4" /> مشروع جديد
            </Button>
          </>
        }
      />
      {me?.perms.includes("import.run") && clients.data && clientCount === 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-brand bg-brand-soft">
          <div>
            <p className="font-semibold">ابدؤوا بنقل عملائكم من المنصة الحالية</p>
            <p className="mt-1 text-sm text-muted">
              اختاروا عميلاً أو أكثر بكامل بياناته ومشاريعه، ثم أضيفوا البقية تدريجياً.
            </p>
          </div>
          <Link
            to="/settings/import"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white dark:text-canvas"
          >
            <FileUp className="size-4" /> استيراد من المنصة الحالية
          </Link>
        </Card>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          to="/clients"
          icon={<Users className="size-5" />}
          label="العملاء"
          value={clients.data ? String(clientCount) : "…"}
        />
        <Stat
          to="/projects"
          icon={<Briefcase className="size-5" />}
          label="مشاريع جارية"
          value={projects.data ? String(pc.active ?? 0) : "…"}
        />
        <Stat
          to="/projects"
          icon={<Briefcase className="size-5" />}
          label="قيمة عقود المشاريع الجارية"
          value={projects.data ? money(activeValue) : "…"}
        />
      </div>
      <h2 className="mb-3 font-semibold">أحدث المشاريع</h2>
      {projects.data && recent.length === 0 ? (
        <EmptyState
          title="لا توجد مشاريع بعد"
          text="ابدؤوا بإضافة عميل ثم مشروعه من صفحة العميل."
        />
      ) : (
        <div className="space-y-2">
          {recent.map((p) => (
            <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="block">
              <Card className="flex items-center justify-between gap-3 py-3 transition hover:border-brand">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{p.clientName}</p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUS_LABELS, p.status)}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <ClientDialog open={newClient} onOpenChange={setNewClient} />
      <ProjectDialog open={newProject} onOpenChange={setNewProject} />
    </>
  );
}

function Stat({
  to,
  icon,
  label,
  value,
}: {
  to: "/clients" | "/projects";
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="transition hover:border-brand">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="text-brand">{icon}</span>
          {label}
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </Card>
    </Link>
  );
}
