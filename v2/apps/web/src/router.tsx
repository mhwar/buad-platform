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
import { Briefcase, House as Home_, Landmark, Menu, Users } from "lucide-react";
import { z } from "zod";
import { AccountPage, AppearancePage } from "./account";
import { api } from "./api";
import { Logo } from "./brand";
import { AppShell } from "./components/shell/AppShell";
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
import { NotificationBell } from "./features/home/NotificationBell";
import { ImportPage } from "./features/import/ImportPage";
import { ComingSoon, SoonPage } from "./features/more/ComingSoon";
import { MoreIndex } from "./features/more/MoreIndex";
import { OrgSettingsPage } from "./features/org/OrgSettings";
import { PlansPage } from "./features/plans/PlansPage";
import { ProductBrochurePage, PublicBrochurePage } from "./features/products/BrochurePages";
import { ProductBuilderPage } from "./features/products/ProductBuilder";
import { ProductsPage } from "./features/products/ProductsPage";
import { ProjectPage } from "./features/projects/ProjectPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { FollowupsPage } from "./features/sales/FollowupsPage";
import { QuotePrintPage } from "./features/sales/QuotePrint";
import { SalesDashboard } from "./features/sales/SalesDashboard";
import { PipelinePage, QuotesPage } from "./features/sales/SalesPage";
import { SettingsLayout } from "./features/settings/SettingsLayout";
import { ProductPublicPage } from "./features/site/ProductPublicPage";
import { SitePage } from "./features/site/SitePage";
import { TasksPage } from "./features/tasks/TasksPage";
import { ActivityPage } from "./features/team/ActivityPage";
import { TeamPage } from "./features/team/TeamPage";
import { WebsiteEditorPage } from "./features/website/WebsiteEditor";
import { Home } from "./home";
import { LoginPage } from "./login";
import { queryClient } from "./query-client";
import { meQuery, setupStatusQuery } from "./session";
import { SetupPage } from "./setup";
import { ThemeToggle } from "./theme";

const rootRoute = createRootRoute({ component: AppShell });

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
  validateSearch: z.object({
    ...listSearch,
    type: z.string().optional(),
    rel: z.enum(["active", "prospect", "former", "dormant", "new"]).optional(),
    owner: z.string().optional(),
    followup: z.enum(["due"]).optional(),
  }),
  beforeLoad: authed,
  component: ClientsPage,
});
const clientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/$id",
  validateSearch: z.object({ tab: z.enum(["overview", "projects", "crm"]).optional() }),
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
const needs = (perm: string) => async () => {
  const me = await queryClient.ensureQueryData(meQuery);
  if (!me) throw redirect({ to: "/login" });
  if (!me.perms.includes(perm)) throw redirect({ to: "/" });
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
    tab: z.enum(["projects", "quarter", "vat", "company", "partners", "receivables"]).optional(),
  }),
  beforeLoad: needs("treasury.view"),
  component: FinancePage,
});
const vatReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance/vat/report",
  validateSearch: z.object({
    year: z.coerce.number().int().min(2000).max(2100).catch(new Date().getFullYear()),
    q: z.coerce.number().int().min(1).max(4).catch(1),
  }),
  beforeLoad: needs("vat.view"),
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
  beforeLoad: needs("products.view"),
  component: function PrintProduct() {
    const { id } = printProductRoute.useParams();
    return <ProductBrochurePage id={id} />;
  },
});
const productsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/products",
  validateSearch: z.object({ tab: z.enum(["products", "overview", "requests"]).optional() }),
  // The requests inbox became «الفرص» under المبيعات; old links still land there.
  beforeLoad: async ({ search }) => {
    if (search.tab === "requests") throw redirect({ to: "/sales/pipeline" });
    await needs("products.view")();
  },
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
  beforeLoad: needs("site.view"),
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
  beforeLoad: needs("products.view"),
  component: ProductBuilderPage,
});
const financeReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance/report",
  validateSearch: z.object(periodSearch),
  beforeLoad: needs("treasury.view"),
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
    if (!me?.perms.includes("import.run")) throw redirect({ to: "/settings/org" });
  },
  component: ImportPage,
});
const teamRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/team",
  beforeLoad: needs("team.view"),
  component: TeamPage,
});
const activityRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/activity",
  beforeLoad: needs("audit.view"),
  component: ActivityPage,
});
const appearanceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/appearance",
  component: AppearancePage,
});
const accountRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/account",
  component: AccountPage,
});

const moreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more",
  beforeLoad: authed,
  component: MoreIndex,
});
const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plans",
  beforeLoad: needs("plans.view"),
  component: PlansPage,
});
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  validateSearch: z.object({ mine: z.string().optional() }),
  beforeLoad: needs("tasks.view"),
  component: TasksPage,
});
const salesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales",
  beforeLoad: needs("sales.view"),
  component: SalesDashboard,
});
const pipelineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/pipeline",
  beforeLoad: needs("sales.view"),
  component: PipelinePage,
});
const quotesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/quotes",
  beforeLoad: needs("sales.view"),
  component: QuotesPage,
});
const followupsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sales/followups",
  beforeLoad: needs("clients.view"),
  component: FollowupsPage,
});
const printQuoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print/quotes/$id",
  beforeLoad: needs("sales.view"),
  component: function PrintQuote() {
    const { id } = printQuoteRoute.useParams();
    return <QuotePrintPage id={id} />;
  },
});
const soonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/soon",
  beforeLoad: authed,
  component: SoonPage,
});
const moreSoonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/more/soon/$key",
  beforeLoad: authed,
  component: function MoreSoon() {
    const { key } = moreSoonRoute.useParams();
    return <ComingSoon tabKey={key} />;
  },
});
/** Old addresses (links in saved notifications, bookmarks) keep working. */
const moved = (from: string, to: string, search?: Record<string, string>) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: from,
    beforeLoad: () => {
      throw redirect({ to, search } as never);
    },
  });
const movedRoutes = [
  moved("/more/plans", "/plans"),
  moved("/more/tasks", "/tasks"),
  moved("/more/sales", "/sales"),
  moved("/more/team", "/settings/team"),
  moved("/more/activity", "/settings/activity"),
  moved("/more/receivables", "/finance", { tab: "receivables" }),
];

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
    moreRoute,
    moreSoonRoute,
    plansRoute,
    tasksRoute,
    salesRoute,
    pipelineRoute,
    quotesRoute,
    followupsRoute,
    printQuoteRoute,
    soonRoute,
    ...movedRoutes,
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
    settingsRoute.addChildren([
      settingsIndexRoute,
      orgRoute,
      importRoute,
      teamRoute,
      activityRoute,
      appearanceRoute,
      accountRoute,
    ]),
    legacyImportRoute,
    legacyAccountRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
