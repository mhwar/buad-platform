import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { PricingPanel } from "./PricingPanel";
import { ProductsPage } from "./ProductsPage";

afterEach(() => vi.unstubAllGlobals());

describe("ProductsPage", () => {
  it("offers the ready-made blueprints when there are no products, and creates one on request", async () => {
    const calls = stubApi({
      "GET /api/products": () => ({ ok: true, products: [] }),
      "GET /api/products/blueprints": () => ({
        ok: true,
        blueprints: [
          {
            key: "patient-transport",
            name: "النقل والتسكين العلاجي",
            tagline: "ت",
            productId: null,
          },
          { key: "project-delivery", name: "إدارة وتنفيذ المشاريع", tagline: "ت", productId: null },
        ],
      }),
      "POST /api/products/from-blueprint/patient-transport": () => [201, { ok: true, id: "prd_1" }],
    });
    await renderWithApp(<ProductsPage />);
    expect(await screen.findByText("لا توجد منتجات بعد")).toBeInTheDocument();
    const buttons = await screen.findAllByRole("button", { name: "ابدأ من هذا القالب" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/patient-transport"))).toBe(
        true,
      ),
    );
  });

  it("does not offer a blueprint that already became a product", async () => {
    stubApi({
      "GET /api/products": () => ({
        ok: true,
        products: [
          {
            id: "prd_1",
            slug: "patient-transport",
            name: "النقل والتسكين العلاجي",
            tagline: "",
            status: "draft",
            showOnSite: false,
            version: 1,
            updatedAt: 1,
            packages: 3,
            readyCount: 4,
            readyTotal: 6,
          },
        ],
      }),
      "GET /api/products/blueprints": () => ({
        ok: true,
        blueprints: [
          {
            key: "patient-transport",
            name: "النقل والتسكين العلاجي",
            tagline: "",
            productId: "prd_1",
          },
          { key: "project-delivery", name: "إدارة وتنفيذ المشاريع", tagline: "", productId: null },
        ],
      }),
    });
    await renderWithApp(<ProductsPage />);
    expect(await screen.findByText(/جاهزية 4\/6/)).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: "ابدأ من هذا القالب" })).toHaveLength(1);
  });
});

describe("seeding the ready-made services", () => {
  it("offers one button that creates all missing blueprints as drafts", async () => {
    const calls = stubApi({
      "GET /api/products": () => ({ ok: true, products: [] }),
      "GET /api/products/blueprints": () => ({
        ok: true,
        blueprints: ["a", "b", "c"].map((k) => ({
          key: k,
          name: `خدمة ${k}`,
          tagline: "",
          productId: null,
        })),
      }),
      "POST /api/products/seed-blueprints": () => ({
        ok: true,
        created: ["a", "b", "c"],
        existing: 0,
      }),
    });
    await renderWithApp(<ProductsPage />);
    expect(await screen.findByText(/3 قوالب جاهزة لم تُنشأ بعد/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الكل كمسودات" }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && c.path === "/api/products/seed-blueprints"),
      ).toBe(true),
    );
  });
});

describe("PricingPanel", () => {
  const pricing = {
    method: "margin" as const,
    value: 20,
    lines: [
      { id: "trip", label: "رحلة", unit: "trip" as const, cost: 100, note: "" },
      { id: "night", label: "ليلة", unit: "night" as const, cost: 250, note: "" },
    ],
    packages: [{ packageId: "full", qty: { trip: 10, night: 4 }, fixedPrice: 0 }],
  };
  const packages = [{ id: "full", name: "المتكاملة", audience: "", features: [], highlight: true }];

  it("computes cost, price and profit from the typed costs", async () => {
    await renderWithApp(
      <PricingPanel pricing={pricing} packages={packages} vatRate={15} onChange={() => {}} />,
    );
    // cost 2,000 → price 2,500 at a 20% margin (shown in the package card and the calculator)
    expect((await screen.findAllByText(/2,500\.00/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2,000\.00/).length).toBeGreaterThan(0);
  });

  it("asks for costs instead of showing a price when a used line has none", async () => {
    const free = { ...pricing, lines: [{ ...pricing.lines[0], cost: 0 }, pricing.lines[1]] };
    await renderWithApp(
      <PricingPanel pricing={free as never} packages={packages} vatRate={15} onChange={() => {}} />,
    );
    expect((await screen.findAllByText(/يحتاج إدخال تكلفة/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2,500\.00/)).toBeNull();
  });
});
