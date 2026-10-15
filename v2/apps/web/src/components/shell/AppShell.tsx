import { effectiveRoleKey, resolveRole } from "@buad/domain";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { SectionTabs } from "../../features/more/SectionTabs";
import { meQuery } from "../../session";
import { MobileTabBar } from "../MobileTabBar";
import { UpdateBanner, useServerVersion } from "../UpdateBanner";
import { AppHeader } from "./AppHeader";
import { activeEntry, buildNav, phoneNav } from "./nav-model";
import { Sidebar } from "./Sidebar";

// Loaded the first time it is opened: the palette brings its own queries and list logic.
const CommandPalette = lazy(() => import("./CommandPalette"));

/** Pages that stand alone, with no app chrome: a shared document, a print page, the public site. */
const STANDALONE = /^\/(s|print|site)(\/|$)/;

/** The signed-in frame: header, sidebar, content, and the phone's bottom bar. */
export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const me = useQuery(meQuery);
  const health = useServerVersion();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const perms = me.data?.perms;
  const groups = useMemo(() => buildNav(perms ?? []), [perms]);
  const phone = useMemo(() => phoneNav(perms ?? []), [perms]);
  const openPalette = useCallback(() => {
    setPaletteLoaded(true);
    setPaletteOpen(true);
  }, []);

  // One listener for the shortcut, wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteLoaded(true);
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A full page load after logout: nothing of the previous user's data stays in memory.
  const logout = useCallback(async () => {
    await api.api.auth.logout.$post().catch(() => undefined);
    window.location.assign("/login");
  }, []);

  // Signed out (login), or a stand-alone page: the page owns the whole screen.
  if (!me.data || STANDALONE.test(path)) return <Outlet />;

  const role = resolveRole(effectiveRoleKey(me.data.roleKey, me.data.role), [])?.name ?? "";
  const active = activeEntry(groups, path);
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-3 focus:top-3 dark:text-canvas"
      >
        تخطَّ إلى المحتوى
      </a>
      <UpdateBanner />
      <AppHeader
        name={me.data.name || me.data.email}
        role={role}
        onSearch={openPalette}
        onLogout={logout}
      />
      <div className="flex flex-1">
        <Sidebar groups={groups} activeKey={active?.key ?? null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[88rem] flex-1 px-4 py-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-8"
          >
            <SectionTabs />
            <Outlet />
          </main>
          <footer className="mb-16 border-t py-4 text-center text-xs text-muted lg:mb-0">
            بُعد التمكين · الإصدار الثاني ·{" "}
            <span data-testid="status">
              {health.isError
                ? "الخادم غير متاح"
                : health.data
                  ? `الخادم يعمل — ${health.data.version}`
                  : "…"}
            </span>
          </footer>
        </div>
      </div>
      <MobileTabBar nav={phone} />
      {paletteLoaded && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            groups={groups}
            canSeeClients={me.data.perms.includes("clients.view")}
            canSeeProjects={me.data.perms.includes("projects.view")}
          />
        </Suspense>
      )}
    </div>
  );
}
