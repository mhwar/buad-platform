import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

import { SetupPage } from "./setup";

afterEach(() => {
  vi.unstubAllGlobals();
  navigate.mockReset();
});

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetupPage />
    </QueryClientProvider>,
  );

async function fill(over: Partial<Record<string, string>> = {}) {
  const v = {
    token: "t".repeat(30),
    name: "مالك",
    email: "info@mhwar.sa",
    password: "a-long-password-1",
    confirm: "a-long-password-1",
    ...over,
  };
  await userEvent.type(screen.getByLabelText("رمز الإعداد"), v.token);
  await userEvent.type(screen.getByLabelText("الاسم"), v.name);
  await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), v.email);
  await userEvent.type(screen.getByLabelText(/^كلمة المرور/), v.password);
  await userEvent.type(screen.getByLabelText("تأكيد كلمة المرور"), v.confirm);
  await userEvent.click(screen.getByRole("button", { name: "إنشاء الحساب والدخول" }));
}

describe("SetupPage", () => {
  it("blocks mismatched passwords without calling the server", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    open();
    await fill({ confirm: "different-password-2" });
    expect(await screen.findByText("كلمتا المرور غير متطابقتين")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("shows a clear message for a wrong token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "invalid_token" }, { status: 403 })),
    );
    open();
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("رمز الإعداد غير صحيح");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("goes home after the owner is created", async () => {
    const f = vi.fn(async () => Response.json({ ok: true, user: { id: "u" } }));
    vi.stubGlobal("fetch", f);
    open();
    await fill();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).not.toHaveProperty("confirm");
    expect(sent.email).toBe("info@mhwar.sa");
  });
});
