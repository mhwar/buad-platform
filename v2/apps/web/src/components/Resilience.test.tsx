import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp } from "../test-utils";
import { PageSkeleton, RouteError, SectionBoundary, SkeletonGrid } from "./Resilience";

afterEach(() => vi.restoreAllMocks());

let broken = true;
function Flaky() {
  if (broken) throw new Error("boom");
  return <p>عاد يعمل</p>;
}

describe("SectionBoundary", () => {
  it("keeps a failure inside its section and tries again on request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    broken = true;
    await renderWithApp(
      <>
        <SectionBoundary label="الاجتماعات">
          <Flaky />
        </SectionBoundary>
        <p>بقية الصفحة</p>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر عرض «الاجتماعات»");
    expect(screen.getByText("بقية الصفحة")).toBeInTheDocument();
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(screen.getByText("عاد يعمل")).toBeInTheDocument();
  });
});

describe("skeletons", () => {
  it("announce loading once, for the page or the list", () => {
    render(
      <>
        <PageSkeleton />
        <SkeletonGrid label="جارٍ تحميل العملاء" />
      </>,
    );
    expect(screen.getByRole("status", { name: "جارٍ تحميل الصفحة" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "جارٍ تحميل العملاء" })).toBeInTheDocument();
  });
});

describe("RouteError", () => {
  it("replaces only the failed page, with a retry and a way home", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const {
      createRootRoute,
      createRoute,
      createRouter,
      createMemoryHistory,
      Outlet,
      RouterProvider,
    } = await import("@tanstack/react-router");
    const root = createRootRoute({
      component: () => (
        <>
          <nav>القائمة</nav>
          <Outlet />
        </>
      ),
    });
    const bad = createRoute({
      getParentRoute: () => root,
      path: "/bad",
      component: () => {
        throw new Error("boom");
      },
    });
    const router = createRouter({
      routeTree: root.addChildren([bad]),
      history: createMemoryHistory({ initialEntries: ["/bad"] }),
      defaultErrorComponent: RouteError,
    });
    await router.load();
    render(<RouterProvider router={router as never} />);
    expect(await screen.findByText("تعذّر عرض هذه الصفحة")).toBeInTheDocument();
    expect(screen.getByText("القائمة")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الرئيسية" })).toBeInTheDocument();
  });
});
