import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarDays,
  CornerDownLeft,
  FileText,
  ListChecks,
  Search,
  ShoppingCart,
  Users,
} from "lucide-react";
import {
  type ComponentType,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { clientsQuery } from "../../features/clients/api";
import { registerQuery } from "../../features/documents/api";
import { requestsQuery } from "../../features/products/products-api";
import { projectsQuery } from "../../features/projects/api";
import { tasksQuery } from "../../features/tasks/queries";
import { meetingsQuery } from "../../features/workspace/api";
import { cx } from "../ui";
import type { NavGroup } from "./nav-model";
import { CREATE_ITEMS, type CreateKind, requestCreate } from "./QuickCreate";

const CREATE_LABEL: Record<CreateKind, string> = {
  opportunity: "فرصة جديدة",
  client: "عميل جديد",
  project: "مشروع جديد",
  task: "مهمة جديدة",
  meeting: "اجتماع جديد",
  decision: "قرار جديد",
};

type Result = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  icon: ComponentType<{ className?: string }>;
  /** A command (e.g. «فرصة جديدة») runs here instead of going to a page. */
  run?: () => void;
};

/** Case- and diacritic-insensitive contains, so «الاداره» finds «الإدارة». */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
export const matches = (text: string, q: string) => fold(text).includes(fold(q.trim()));

/**
 * Ctrl/⌘+K: jump to any section the person may use, or find a client or project by name.
 * Keyboard-first (arrows, Enter, Esc); a combobox over a listbox for screen readers.
 */
export default function CommandPalette({
  open,
  onOpenChange,
  groups,
  canSeeClients,
  canSeeProjects,
  canSeeSales = false,
  canSeeMeetings = false,
  perms = [],
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: NavGroup[];
  canSeeClients: boolean;
  canSeeProjects: boolean;
  canSeeSales?: boolean;
  canSeeMeetings?: boolean;
  /** For the documents and tasks results, and the «إنشاء» commands. */
  perms?: string[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = useDeferredValue(query.trim());
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const clients = useQuery({
    ...clientsQuery({ q }),
    enabled: open && canSeeClients && q.length >= 2,
  });
  const projects = useQuery({
    ...projectsQuery({ q }),
    enabled: open && canSeeProjects && q.length >= 2,
  });

  // Opportunities and meetings are short lists: fetched once while searching, matched here.
  const opps = useQuery({ ...requestsQuery(""), enabled: open && canSeeSales && q.length >= 2 });
  const meets = useQuery({
    ...meetingsQuery({}),
    enabled: open && canSeeMeetings && q.length >= 2,
  });

  const docs = useQuery({
    ...registerQuery({ q }),
    enabled: open && perms.includes("documents.view") && q.length >= 2,
  });
  const todo = useQuery({
    ...tasksQuery({}),
    enabled: open && perms.includes("tasks.view") && q.length >= 2,
  });

  const results = useMemo<Result[]>(() => {
    const commands: Result[] = CREATE_ITEMS.filter((c) => perms.includes(c.perm))
      .map((c) => ({
        id: `new:${c.kind}`,
        group: "إنشاء",
        label: CREATE_LABEL[c.kind],
        to: "",
        icon: c.icon,
        run: () => requestCreate(c.kind),
      }))
      .filter((c) => !q || matches(c.label, q));
    const all: Result[] = groups.flatMap((g) =>
      g.items.flatMap((i) => [
        {
          id: `nav:${i.key}`,
          group: "الأقسام",
          label: i.label,
          hint: i.hint,
          to: i.to,
          icon: i.icon,
        },
        ...i.tabs.map((t) => ({
          id: `nav:${i.key}:${t.key}`,
          group: "الأقسام",
          label: `${i.label} › ${t.label}`,
          hint: t.desc,
          to: t.to,
          icon: i.icon,
        })),
      ]),
    );
    // Typing: sections whose name matches come before those that only mention it in their description.
    const sections = q
      ? all
          .filter((r) => matches(`${r.label} ${r.hint}`, q))
          .sort((a, b) => Number(!matches(a.label, q)) - Number(!matches(b.label, q)))
      : all;
    const people: Result[] = (clients.data?.items ?? []).slice(0, 5).map((c) => ({
      id: `client:${c.id}`,
      group: "العملاء",
      label: c.name,
      to: "/clients/$id",
      params: { id: c.id },
      icon: Users,
    }));
    const work: Result[] = (projects.data?.items ?? []).slice(0, 5).map((p) => ({
      id: `project:${p.id}`,
      group: "المشاريع",
      label: p.name,
      hint: p.clientName,
      to: "/projects/$id",
      params: { id: p.id },
      icon: Briefcase,
    }));
    const deals: Result[] = q
      ? (opps.data?.requests ?? [])
          .filter((r) => !r.interest && matches(`${r.entity} ${r.name} ${r.productName}`, q))
          .slice(0, 5)
          .map((r) => ({
            id: `opp:${r.id}`,
            group: "الفرص",
            label: r.entity || r.name,
            hint: r.productName,
            to: "/sales/$id",
            params: { id: r.id },
            icon: ShoppingCart,
          }))
      : [];
    const talks: Result[] = q
      ? (meets.data ?? [])
          .filter((m) => matches(m.title, q))
          .slice(-5)
          .reverse()
          .map((m) => ({
            id: `meeting:${m.id}`,
            group: "الاجتماعات",
            label: m.title,
            hint: m.startsAt.replace("T", " "),
            to: "/meetings",
            search: { open: m.id },
            icon: CalendarDays,
          }))
      : [];
    const papers: Result[] = q
      ? (docs.data?.items ?? []).slice(0, 5).map((d) => ({
          id: `doc:${d.id}`,
          group: "المستندات",
          label: d.title || (d.kind === "contract" ? "عقد" : "خطاب"),
          hint: [d.outgoingNo || d.number, d.clientName].filter(Boolean).join(" · "),
          to: "/projects/$id/documents/$docId",
          params: { id: d.projectId, docId: d.id },
          icon: FileText,
        }))
      : [];
    const jobs: Result[] = q
      ? (todo.data ?? [])
          .filter((t) => t.status !== "done" && matches(`${t.title} ${t.projectName ?? ""}`, q))
          .slice(0, 5)
          .map((t) => ({
            id: `task:${t.id}`,
            group: "المهام",
            label: t.title,
            hint: [t.projectName, t.assigneeName].filter(Boolean).join(" · "),
            to: "/tasks",
            search: { scope: "all", q: t.title },
            icon: ListChecks,
          }))
      : [];
    // Typing a command's words («جديد», «اجتماع») puts it first; an empty box lists them after the sections.
    const head = q
      ? [...commands, ...sections.slice(0, 8)]
      : [...sections.slice(0, 12), ...commands];
    return [...head, ...people, ...work, ...deals, ...papers, ...jobs, ...talks];
  }, [groups, q, perms, clients.data, projects.data, opps.data, meets.data, docs.data, todo.data]);

  // Keep the highlighted row valid and in view as results change or the arrows move.
  const current = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current, results]);

  const go = (r: Result) => {
    onOpenChange(false);
    setQuery("");
    setActive(0);
    if (r.run) r.run();
    else navigate({ to: r.to, params: r.params, search: r.search } as never);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[current]) {
      e.preventDefault();
      go(results[current]);
    }
  };

  let lastGroup = "";
  return (
    <RDialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className="fixed inset-x-3 top-[12vh] z-50 mx-auto flex max-h-[70dvh] max-w-xl flex-col overflow-hidden rounded-2xl border bg-surface shadow-2xl"
        >
          <RDialog.Title className="sr-only">بحث وانتقال سريع</RDialog.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-5 shrink-0 text-muted" />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[current] ? `${listId}-${current}` : undefined}
              aria-label="ابحث عن قسم أو عميل أو مشروع"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="ابحث عن قسم أو عميل أو مشروع…"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            />
            <kbd className="hidden rounded border px-1.5 py-0.5 text-xs text-muted sm:block">
              Esc
            </kbd>
          </div>
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="النتائج"
            className="flex-1 overflow-y-auto p-2"
          >
            {results.length === 0 && (
              <li role="presentation" className="px-3 py-8 text-center text-sm text-muted">
                لا نتائج لـ «{q}»
              </li>
            )}
            {results.map((r, i) => {
              const header = r.group !== lastGroup;
              lastGroup = r.group;
              return (
                <li key={r.id} role="presentation">
                  {header && (
                    <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted">{r.group}</p>
                  )}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === current}
                    tabIndex={-1}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm",
                      i === current ? "bg-brand-soft text-brand" : "hover:bg-brand-soft/50",
                    )}
                  >
                    <r.icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {r.label}
                      {r.hint && <span className="ms-2 text-xs text-muted">{r.hint}</span>}
                    </span>
                    {i === current && <CornerDownLeft className="size-3.5 shrink-0 text-muted" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
