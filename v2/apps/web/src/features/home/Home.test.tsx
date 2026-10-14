import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, stubApi } from "../../test-utils";
import { AttentionPanel } from "./AttentionPanel";
import { NotificationBell } from "./NotificationBell";

afterEach(() => vi.unstubAllGlobals());

describe("AttentionPanel", () => {
  it("lists what needs attention with counts and the setup checklist", async () => {
    stubApi({
      "GET /api/attention": () => ({
        ok: true,
        items: [
          {
            key: "docs",
            tone: "info",
            title: "مستندات بانتظار الاعتماد",
            count: 3,
            link: "/documents?status=review",
          },
        ],
        checklist: [
          {
            key: "org",
            label: "أكمل بيانات الجهة والرقم الضريبي",
            done: true,
            link: "/settings/org",
          },
          { key: "client", label: "أضف أول عميل", done: false, link: "/clients" },
        ],
      }),
    });
    await renderWithApp(<AttentionPanel />);
    const link = await screen.findByRole("link", { name: /مستندات بانتظار الاعتماد/ });
    expect(link).toHaveAttribute("href", "/documents?status=review");
    expect(link).toHaveTextContent("3");
    expect(screen.getByText(/أنجزت 1 من 2/)).toBeInTheDocument();
  });

  it("renders nothing when all is well", async () => {
    stubApi({ "GET /api/attention": () => ({ ok: true, items: [], checklist: [] }) });
    const { container } = await renderWithApp(<AttentionPanel />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("h2")).toBeNull();
  });
});

describe("NotificationBell", () => {
  it("shows the unread count and marks all as read", async () => {
    let unread = 2;
    const calls = stubApi({
      "GET /api/notifications": () => ({
        ok: true,
        unread,
        items: [
          {
            id: "n1",
            kind: "approval",
            title: "طلب اعتماد: خطاب",
            link: "/documents",
            readAt: 0,
            createdAt: Math.floor(Date.now() / 1000),
          },
        ],
      }),
      "POST /api/notifications/read-all": () => {
        unread = 0;
        return { ok: true };
      },
    });
    await renderWithApp(<NotificationBell />);
    const bell = await screen.findByRole("button", { name: /2 غير مقروءة/ });
    await userEvent.click(bell);
    expect(await screen.findByText("طلب اعتماد: خطاب")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تعليم الكل كمقروء" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/api/notifications/read-all")).toBe(true),
    );
  });
});
