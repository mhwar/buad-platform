import { DEFAULT_SITE } from "@buad/schema/site";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { RequestDialog } from "./RequestDialog";
import { SitePage } from "./SitePage";

afterEach(() => vi.unstubAllGlobals());

describe("public site", () => {
  it("says it is being prepared until something is published", async () => {
    stubApi({ "GET /api/public/site": () => ({ ok: true, published: false }) });
    await renderWithApp(<SitePage />);
    expect(await screen.findByText("الموقع قيد الإعداد")).toBeInTheDocument();
  });

  it("renders the published content without any app chrome", async () => {
    stubApi({
      "GET /api/public/site": () => ({
        ok: true,
        published: true,
        site: DEFAULT_SITE,
        logoUrl: "/site/logo.png",
        products: [],
      }),
    });
    await renderWithApp(<SitePage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("مشروعك علينا");
    expect(screen.getByText("منظومة واحدة لخدمة مشروعك")).toBeInTheDocument();
    expect(screen.queryByText("العملاء")).toBeNull();
  });
});

describe("RequestDialog", () => {
  const target = {
    slug: "patient-transport",
    name: "النقل",
    intake: [
      { key: "city", label: "المدينة", type: "text" as const, options: [], required: true },
      {
        key: "svc",
        label: "الخدمة",
        type: "select" as const,
        options: ["نقل", "تسكين"],
        required: false,
      },
    ],
  };

  it("asks the product's questions and posts the answers with the product", async () => {
    const calls = stubApi({
      "POST /api/public/site/requests": () => [201, { ok: true }],
    });
    await renderWithApp(<RequestDialog target={target} open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("الاسم"), { target: { value: "ليلى" } });
    fireEvent.change(screen.getByLabelText("الجوال"), { target: { value: "0551234567" } });
    fireEvent.change(await screen.findByLabelText(/المدينة/), { target: { value: "جدة" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال الطلب" }));
    expect(await screen.findByText("وصلنا طلبك")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      productSlug: "patient-transport",
      name: "ليلى",
      answers: { city: "جدة" },
      website: "",
    });
  });

  it("shows a clear message when the server refuses", async () => {
    stubApi({
      "POST /api/public/site/requests": () => [429, { ok: false, error: "rate_limited" }],
    });
    await renderWithApp(<RequestDialog target={null} open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("الاسم"), { target: { value: "ليلى" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال الطلب" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("طلبات كثيرة"));
  });
});

describe("a coming-soon product", () => {
  const erp = {
    slug: "erp-platform",
    name: "منصة بُعد ERP",
    tagline: "",
    hero: { eyebrow: "قريباً", title: "إدارة جهتك كلها", subtitle: "وصف", tags: [] },
    packages: 0,
    comingSoon: true,
    intake: [
      {
        key: "client_type",
        label: "من أنتم؟",
        type: "select",
        options: ["جمعية أهلية", "شركة"],
        required: true,
      },
      {
        key: "wish",
        label: "ما الذي تتمنون؟",
        type: "multi",
        options: ["المالية", "المستندات"],
        required: false,
      },
    ],
  };

  it("the home page says «قريباً» and offers to register interest, with tap chips", async () => {
    const calls = stubApi({
      "GET /api/public/site": () => ({
        ok: true,
        published: true,
        site: DEFAULT_SITE,
        logoUrl: "/site/logo.png",
        products: [erp],
      }),
      "POST /api/public/site/requests": () => [201, { ok: true }],
    });
    await renderWithApp(<SitePage />);
    const cta = await screen.findByRole("button", { name: "سجّل اهتمامك" });
    expect(screen.getAllByText(/قريباً/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "اطلب عرضاً" })).not.toBeNull(); // the page-level contact button stays
    fireEvent.click(cta);
    expect(await screen.findByRole("dialog")).toHaveTextContent("سجّل اهتمامك");
    // single choice and multi choice render as chips, not a dropdown
    fireEvent.click(screen.getByLabelText("جمعية أهلية"));
    fireEvent.click(screen.getByLabelText("المالية"));
    fireEvent.click(screen.getByLabelText("المستندات"));
    fireEvent.change(screen.getByLabelText("الاسم"), { target: { value: "ليلى" } });
    fireEvent.change(screen.getByLabelText("الجوال"), { target: { value: "0551234567" } });
    fireEvent.click(screen.getByRole("button", { name: "سجّل اهتمامي" }));
    expect(
      await screen.findByText("سجّلنا اهتمامك. سنتواصل معك أولاً عند الإطلاق."),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      productSlug: "erp-platform",
      answers: { client_type: "جمعية أهلية", wish: "المالية، المستندات" },
    });
  });
});
