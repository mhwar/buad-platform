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

  it("moves to the set-password step for first-login users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, action: "setup", setupToken: "tok" })),
    );
    renderPage();
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "new@b.sa");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "x");
    await userEvent.click(screen.getByRole("button", { name: "دخول" }));
    expect(await screen.findByText("تعيين كلمة المرور")).toBeInTheDocument();
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
