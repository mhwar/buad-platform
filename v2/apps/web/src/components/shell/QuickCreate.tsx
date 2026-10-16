import * as RMenu from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarDays,
  Gavel,
  ListChecks,
  Plus,
  ShoppingCart,
  Users,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { ClientDialog } from "../../features/clients/ClientDialog";
import { ProjectDialog } from "../../features/projects/ProjectDialog";
import { NewOpportunityDialog } from "../../features/sales/NewOpportunityDialog";
import { TaskDialog } from "../../features/tasks/TaskDialogs";
import { DecisionDialog } from "../../features/workspace/DecisionDialog";
import { MeetingDialog } from "../../features/workspace/MeetingDialog";
import { useCan } from "../../session";
import { cx } from "../ui";

type Kind = "client" | "opportunity" | "project" | "task" | "meeting" | "decision";
const ITEMS: {
  kind: Kind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  perm: string;
}[] = [
  { kind: "opportunity", label: "فرصة بيع", icon: ShoppingCart, perm: "sales.edit" },
  { kind: "client", label: "عميل", icon: Users, perm: "clients.edit" },
  { kind: "project", label: "مشروع", icon: Briefcase, perm: "projects.edit" },
  { kind: "task", label: "مهمة", icon: ListChecks, perm: "tasks.edit" },
  { kind: "meeting", label: "اجتماع", icon: CalendarDays, perm: "meetings.edit" },
  { kind: "decision", label: "قرار", icon: Gavel, perm: "meetings.edit" },
];

/** «إنشاء جديد»: the things people add most, one click away, with the forms they already know. */
export function QuickCreate({ collapsed, fab = false }: { collapsed: boolean; fab?: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Kind | null>(null);
  const items = ITEMS.filter((i) => can(i.perm));
  if (!items.length) return null;
  const item =
    "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-brand-soft";
  return (
    <>
      <RMenu.Root dir="rtl">
        <RMenu.Trigger asChild>
          <button
            type="button"
            aria-label="إنشاء جديد"
            title={collapsed ? "إنشاء جديد" : undefined}
            className={cx(
              fab
                ? "grid size-14 place-items-center rounded-full bg-brand text-white shadow-lg ring-4 ring-canvas transition hover:bg-brand-strong dark:text-canvas"
                : "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong dark:text-canvas",
              collapsed && !fab && "px-0",
            )}
          >
            <Plus className={fab ? "size-6" : "size-4"} />
            {!collapsed && "إنشاء جديد"}
          </button>
        </RMenu.Trigger>
        <RMenu.Portal>
          <RMenu.Content
            align="start"
            side={fab ? "top" : collapsed ? "left" : "bottom"}
            sideOffset={8}
            className="z-50 min-w-52 rounded-xl border bg-surface p-1 shadow-lg"
          >
            {items.map((i) => (
              <RMenu.Item key={i.kind} className={item} onSelect={() => setOpen(i.kind)}>
                <i.icon className="size-4 text-muted" />
                {i.label}
              </RMenu.Item>
            ))}
          </RMenu.Content>
        </RMenu.Portal>
      </RMenu.Root>
      <ClientDialog open={open === "client"} onOpenChange={(v) => !v && setOpen(null)} />
      <ProjectDialog open={open === "project"} onOpenChange={(v) => !v && setOpen(null)} />
      {open === "task" && (
        <TaskDialog
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }}
        />
      )}
      <NewOpportunityDialog open={open === "opportunity"} onClose={() => setOpen(null)} />
      {open === "meeting" && (
        <MeetingDialog
          onClose={() => setOpen(null)}
          onSaved={(id) => navigate({ to: "/meetings", search: { open: id } })}
        />
      )}
      {open === "decision" && <DecisionDialog onClose={() => setOpen(null)} />}
    </>
  );
}
