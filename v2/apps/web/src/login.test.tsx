import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

import { LoginPage } from "./login";

afterEach(() => {
  vi.unstubAllGlobals();
  navigate.mockReset();
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LoginPage />
    </QueryClientProvider>,
  );

describe("LoginPage", () => {
  it("shows an error on bad credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 }),
      ),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "a@b.sa");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("غير صحيحة");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the set-password form when opened from an invite link", async () => {
    window.history.pushState({}, "", "/login?token=abc");
    const post = vi.fn(async () => Response.json({ ok: true, user: { id: "u" } }));
    vi.stubGlobal("fetch", post);
    renderPage();
    expect(screen.getByText("تعيين كلمة المرور")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("كلمة المرور الجديدة"), "a-strong-pass");
    await userEvent.type(screen.getByLabelText("تأكيد كلمة المرور"), "a-strong-pass");
    await userEvent.click(screen.getByRole("button", { name: "حفظ ودخول" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    window.history.pushState({}, "", "/");
  });

  it("navigates home after a successful login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, user: { id: "u" } })),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "a@b.sa");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "goodpass1");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });
});
