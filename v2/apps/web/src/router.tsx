import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import {
  Briefcase,
  Files,
  Globe,
  House as Home_,
  Landmark,
  Package,
  Settings,
  Users,
} from "lucide-react";
import { z } from "zod";
import { AccountPage } from "./account";
import { api } from "./api";
import { Logo } from "./brand";
import { UpdateBanner, useServerVersion } from "./components/UpdateBanner";
import { ClientPage } from "./features/clients/ClientPage";
import { ClientsPage } from "./features/clients/ClientsPage";
import { StatementPage } from "./features/clients/StatementPage";
import { PrintDocumentPage } from "./features/documents/DocumentActions";
import { DocumentEditor } from "./features/documents/DocumentEditor";
import { DocumentsPage } from "./features/documents/DocumentsPage";
import { PublicDocumentPage } from "./features/documents/PublicDocument";
import { ProjectFinanceReport } from "./features/finance/ProjectFinanceReport";
import { FinancePage } from "./features/finance-overview/FinancePage";
import { ReportPage } from "./features/finance-overview/ReportPage";
import { VatReportPage } from "./features/finance-overview/VatReportPage";
import { ImportPage } from "./features/import/ImportPage";
import { OrgSettingsPage } from "./features/org/OrgSettings";
import { ProductBrochurePage, PublicBrochurePage } from "./features/products/BrochurePages";
import { ProductBuilderPage } from "./features/products/ProductBuilder";
import { ProductsPage } from "./features/products/ProductsPage";
import { ProjectPage } from "./features/projects/ProjectPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { ProductPublicPage } from "./features/site/ProductPublicPage";
import { SitePage } from "./features/site/SitePage";
import { WebsiteEditorPage } from "./features/website/WebsiteEditor";
import { Home } from "./home";
import { LoginPage } from "./login";
import { queryClient } from "./query-client";
import { meQuery, setupStatusQuery } from "./session";
import { SetupPage } from "./setup";
import { ThemeToggle } from "./theme";

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home_, exact: true },
  { to: "/clients", label: "العملاء", icon: Users, exact: false },
  { to: "/projects", label: "المشاريع", icon: Briefcase, exact: false },
  { to: "/documents", label: "المستندات", icon: Files, exact: false },
  { to: "/finance", label: "المالية", icon: Landmark, exact: false, managerOnly: true },
  { to: "/products", label: "المنتجات والخدمات", icon: Package, exact: false, managerOnly: true },
  { to: "/website", label: "الموقع", icon: Globe, exact: false, managerOnly: true },
] as const;

function Shell() {
  // Pages that stand alone (no app chrome): a shared document, or a page prepared for PDF.
  const isShareLink = useRouterState({
    select: (s) => /^\/(s|print|site)(\/|$)/.test(s.location.pathname),
  });
  const me = useQuery(meQuery);
  const health = useServerVersion();
  // A full page load after logout: nothing of the previous user's data stays in memory,
  // and the next sign-in starts from a clean state.
  const logout = async () => {
    await api.api.auth.logout.$post().catch(() => undefined);
    window.location.assign("/login");
  };
  // Signed out (login), or a document opened from a share link: the page owns the whole screen.
  if (!me.data || isShareLink) return <Outlet />;
  const manager = me.data.role === "owner" || me.data.role === "admin";
  const nav = NAV.filter((n) => !("managerOnly" in n) || manager);
  const navLink =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-brand-soft hover:text-ink";
  const navActive = "bg-brand-soft font-semibold text-brand";
  return (
    <div className="flex min-h-screen flex-col">
      <UpdateBanner />
      <header className="sticky top-0 z-20 border-b bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="الرئيسية">
            <Logo className="hidden h-11 w-auto sm:block" />
            <Logo variant="icon" className="h-9 w-auto sm:hidden" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <Link
              to="/settings/account"
              className="text-muted hover:text-ink"
              activeProps={{ className: "font-semibold text-ink" }}
            >
              {me.data.name || me.data.email}
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border px-3 py-1.5 text-muted transition hover:text-ink"
            >
              خروج
            </button>
          </div>
        </div>
        {/* Mobile: the sections become a scrollable strip under the header. */}
        <nav
          className="flex gap-1 overflow-x-auto border-t px-3 py-2 lg:hidden"
          aria-label="الأقسام"
        >
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className={navLink}
              activeProps={{ className: navActive }}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          ))}
          <Link to="/settings" className={navLink} activeProps={{ className: navActive }}>
            <Settings className="size-4" />
            الإعدادات
          </Link>
        </nav>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 sm:px-6">
        <aside className="hidden w-52 shrink-0 py-6 lg:block">
          <nav className="sticky top-24 space-y-1" aria-label="الأقسام">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className={navLink}
                activeProps={{ className: navActive }}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
            <hr className="my-3" />
            <Link to="/settings" className={navLink} activeProps={{ className: navActive }}>
              <Settings className="size-4" />
              الإعدادات
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 py-6">
          <Outlet />
        </main>
      </div>
      <footer className="border-t py-4 text-center text-xs text-muted">
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
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: "/login" });
  },
  component: Home,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async () => {
    // Only reachable while the one-time setup is available; otherwise it does not exist.
    const needs = await queryClient.fetchQuery({ ...setupStatusQuery, staleTime: 0 });
    if (!needs) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

/** Signed-in only: every business route uses this guard. */
const authed = async () => {
  const me = await queryClient.ensureQueryData(meQuery);
  if (!me) throw redirect({ to: "/login" });
};

// List filters live in the URL, so a filtered view can be bookmarked or shared.
const listSearch = {
  q: z.string().optional(),
  sort: z.enum(["newest", "name", "value"]).optional(),
  view: z.enum(["grid", "list"]).optional(),
  archived: z.boolean().optional(),
};

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  validateSearch: z.object({ ...listSearch, type: z.string().optional() }),
  beforeLoad: authed,
  component: ClientsPage,
});
const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id",
  validateSearch: z.object({ tab: z.enum(["overview", "projects"]).optional() }),
  beforeLoad: authed,
  component: ClientPage,
});
const statementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id/statement",
  beforeLoad: authed,
  component: StatementPage,
});
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  validateSearch: z.object({
    ...listSearch,
    status: z.string().optional(),
    product: z.string().optional(),
  }),
  beforeLoad: authed,
  component: ProjectsPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id",
  // ?view= picks the section; the old ?tab= links keep working (they land on finance).
  validateSearch: z.object({
    view: z.enum(["finance", "documents", "execution"]).optional(),
    tab: z.string().optional(),
  }),
  beforeLoad: authed,
  component: ProjectPage,
});

// Public: a document sent by link (no sign-in; the token is the permission).
const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$token",
  component: PublicDocumentPage,
});

const printDocumentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print/documents/$docId",
  beforeLoad: authed,
  component: function PrintDocument() {
    const { docId } = printDocumentRoute.useParams();
    return <PrintDocumentPage docId={docId} />;
  },
});

/** Finance across the organisation: owner and managers only. */
const managerOnly = async () => {
  const me = await queryClient.ensureQueryData(meQuery);
  if (!me) throw redirect({ to: "/login" });
  if (me.role !== "owner" && me.role !== "admin") throw redirect({ to: "/" });
};
const periodSearch = {
  from: z.string().optional(),
  to: z.string().optional(),
};
const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  validateSearch: z.object({
    ...periodSearch,
    preset: z.enum(["all", "year", "last", "quarter", "custom"]).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    q: z.coerce.number().int().min(1).max(4).optional(),
    client: z.string().optional(),
    status: z.string().optional(),
    tab: z.enum(["projects", "quarter", "vat", "company", "partners"]).optional(),
  }),
  beforeLoad: managerOnly,
  component: FinancePage,
});
const vatReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance/vat/report",
  validateSearch: z.object({
    year: z.coerce.number().int().min(2000).max(2100).catch(new Date().getFullYear()),
    q: z.coerce.number().int().min(1).max(4).catch(1),
  }),
  beforeLoad: managerOnly,
  component: VatReportPage,
});
// Public website (no sign-in; the page owns the whole screen).
const siteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/site",
  validateSearch: z.object({
    preview: z.coerce.boolean().optional(),
    fonts: z.coerce.boolean().optional(),
  }),
  component: SitePage,
});
const siteProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/site/p/$slug",
  component: ProductPublicPage,
});
const siteBrochureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/site/p/$slug/brochure",
  component: function SiteBrochure() {
    const { slug } = siteBrochureRoute.useParams();
    return <PublicBrochurePage slug={slug} />;
  },
});
const printProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print/products/$id",
  beforeLoad: managerOnly,
  component: function PrintProduct() {
    const { id } = printProductRoute.useParams();
    return <ProductBrochurePage id={id} />;
  },
});
const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products",
  validateSearch: z.object({ tab: z.enum(["products", "overview", "requests"]).optional() }),
  beforeLoad: managerOnly,
  component: ProductsPage,
});
const websiteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/website",
  validateSearch: z.object({
    tab: z
      .enum(["overview", "identity", "home", "services", "works", "form", "seo", "history"])
      .optional(),
  }),
  beforeLoad: managerOnly,
  component: WebsiteEditorPage,
});
const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products/$id",
  validateSearch: z.object({
    step: z
      .enum(["identity", "packages", "pricing", "performance", "intake", "content", "publish"])
      .optional(),
  }),
  beforeLoad: managerOnly,
  component: ProductBuilderPage,
});
const financeReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance/report",
  validateSearch: z.object(periodSearch),
  beforeLoad: managerOnly,
  component: ReportPage,
});

const printFinanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print/finance/$projectId",
  validateSearch: z.object({ mode: z.enum(["client", "detailed"]).optional() }),
  beforeLoad: authed,
  component: function PrintFinance() {
    const { projectId } = printFinanceRoute.useParams();
    const { mode = "client" } = printFinanceRoute.useSearch();
    const navigate = printFinanceRoute.useNavigate();
    return (
      <ProjectFinanceReport
        projectId={projectId}
        mode={mode}
        onMode={(m) => navigate({ search: { mode: m }, replace: true })}
      />
    );
  },
});

const documentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents",
  validateSearch: z.object({
    q: z.string().optional(),
    kind: z.enum(["contract", "letter"]).optional(),
    status: z.enum(["draft", "review", "approved"]).optional(),
    view: z.enum(["outgoing"]).optional(),
  }),
  beforeLoad: authed,
  component: DocumentsPage,
});

const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id/documents/$docId",
  beforeLoad: authed,
  component: DocumentEditor,
});

// «الإعدادات»: a layout with its own sub-navigation; each option is a child page.
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: authed,
  component: SettingsLayout,
});
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/org" });
  },
});
const orgRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/org",
  component: OrgSettingsPage,
});
const importRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/import",
  beforeLoad: async () => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me?.role !== "owner") throw redirect({ to: "/settings/org" });
  },
  component: ImportPage,
});
const accountRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/account",
  component: AccountPage,
});

// Old addresses keep working.
const legacyImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/import",
  beforeLoad: () => {
    throw redirect({ to: "/settings/import" });
  },
});
const legacyAccountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  beforeLoad: () => {
    throw redirect({ to: "/settings/account" });
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    loginRoute,
    setupRoute,
    clientsRoute,
    clientRoute,
    statementRoute,
    projectsRoute,
    projectRoute,
    documentsRoute,
    documentRoute,
    financeRoute,
    financeReportRoute,
    vatReportRoute,
    productsRoute,
    productRoute,
    websiteRoute,
    siteRoute,
    siteProductRoute,
    siteBrochureRoute,
    printProductRoute,
    shareRoute,
    printDocumentRoute,
    printFinanceRoute,
    settingsRoute.addChildren([settingsIndexRoute, orgRoute, importRoute, accountRoute]),
    legacyImportRoute,
    legacyAccountRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
