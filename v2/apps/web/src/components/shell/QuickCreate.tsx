import * as RMenu from "@radix-ui/react-dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ListChecks, Plus, ShoppingCart, Users } from "lucide-react";
import { type ComponentType, useState } from "react";
import { ClientDialog } from "../../features/clients/ClientDialog";
import { productsQuery } from "../../features/products/products-api";
import { AddDialog } from "../../features/products/RequestsInbox";
import { ProjectDialog } from "../../features/projects/ProjectDialog";
import { TaskDialog } from "../../features/tasks/TaskDialogs";
import { useCan } from "../../session";
import { cx } from "../ui";

type Kind = "client" | "opportunity" | "project" | "task";
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
];

/** «إنشاء جديد»: the things people add most, one click away, with the forms they already know. */
export function QuickCreate({ collapsed }: { collapsed: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Kind | null>(null);
  const products = useQuery({ ...productsQuery, enabled: open === "opportunity" });
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
              "flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-sm transition hover:bg-brand-strong dark:text-canvas",
              collapsed && "px-0",
            )}
          >
            <Plus className="size-4" />
            {!collapsed && "إنشاء جديد"}
          </button>
        </RMenu.Trigger>
        <RMenu.Portal>
          <RMenu.Content
            align="start"
            side={collapsed ? "left" : "bottom"}
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
      <AddDialog
        open={open === "opportunity"}
        onClose={() => setOpen(null)}
        products={products.data ?? []}
        onDone={() => qc.invalidateQueries({ queryKey: ["product-requests"] })}
      />
    </>
  );
}
