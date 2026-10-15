import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Briefcase, CornerDownLeft, Search, Users } from "lucide-react";
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
import { projectsQuery } from "../../features/projects/api";
import { cx } from "../ui";
import type { NavGroup } from "./nav-model";

type Result = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
  params?: Record<string, string>;
  icon: ComponentType<{ className?: string }>;
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: NavGroup[];
  canSeeClients: boolean;
  canSeeProjects: boolean;
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

  const results = useMemo<Result[]>(() => {
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
    return [...sections.slice(0, q ? 8 : 12), ...people, ...work];
  }, [groups, q, clients.data, projects.data]);

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
    navigate({ to: r.to, params: r.params } as never);
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
            <kbd className="hidden rounded border px-1.5 py-0.5 text-[11px] text-muted sm:block">
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
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-muted">{r.group}</p>
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
