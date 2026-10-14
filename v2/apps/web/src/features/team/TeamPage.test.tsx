import { DEFAULT_ROLES } from "@buad/domain";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meUser, renderWithApp, stubApi } from "../../test-utils";
import { SettingsLayout } from "../settings/SettingsLayout";
import { TeamPage } from "./TeamPage";

afterEach(() => vi.unstubAllGlobals());

const roles = DEFAULT_ROLES.map((r) => ({
  ...r,
  builtin: true,
  edited: false,
  users: r.key === "owner" ? 1 : 0,
}));
const users = [
  {
    id: "u1",
    email: "o@a.sa",
    name: "المالك",
    roleKey: "owner",
    roleName: "المالك",
    active: true,
    pending: false,
    lastLoginAt: 1,
    createdAt: 1,
  },
  {
    id: "u2",
    email: "n@a.sa",
    name: "نورة",
    roleKey: "sales",
    roleName: "مبيعات وعلاقات عملاء",
    active: false,
    pending: false,
    lastLoginAt: 0,
    createdAt: 1,
  },
];
const base = (role = "owner") => ({
  "GET /api/me": () => ({ ok: true, user: meUser(role) }),
  "GET /api/team/users": () => ({ ok: true, users }),
  "GET /api/team/roles": () => ({ ok: true, roles }),
});

describe("TeamPage", () => {
  it("lists people with role and state", async () => {
    stubApi(base());
    await renderWithApp(<TeamPage />);
    expect(await screen.findByText("نورة")).toBeInTheDocument();
    expect(screen.getByText("موقوف")).toBeInTheDocument();
    expect(screen.getByText("لم يسجّل دخولاً")).toBeInTheDocument();
  });

  it("invites a person and shows the activation link", async () => {
    const calls = stubApi({
      ...base(),
      "POST /api/team/users": () => [201, { ok: true, id: "u3", setupToken: "tok123" }],
    });
    await renderWithApp(<TeamPage />);
    await userEvent.click(await screen.findByRole("button", { name: /دعوة مستخدم/ }));
    await userEvent.type(screen.getByLabelText("الاسم"), "خالد");
    await userEvent.type(screen.getByLabelText("البريد الإلكتروني"), "k@a.sa");
    await userEvent.click(screen.getByRole("button", { name: "إنشاء الدعوة" }));
    expect(await screen.findByDisplayValue(/login\?token=tok123/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      roleKey: "team-member",
      email: "k@a.sa",
    });
  });

  it("a general manager can invite, as admins always could", async () => {
    stubApi(base("general-manager"));
    await renderWithApp(<TeamPage />);
    await screen.findByText("نورة");
    // the general manager can manage users (as admins always could)
    expect(screen.getByRole("button", { name: /دعوة مستخدم/ })).toBeInTheDocument();
  });

  it("edits a role's permissions with the table and saves them", async () => {
    const calls = stubApi({ ...base(), "PUT /api/team/roles/team-member": () => ({ ok: true }) });
    await renderWithApp(<TeamPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "الأدوار والصلاحيات" }));
    await userEvent.click(await screen.findByRole("button", { name: /عضو فريق/ }));
    const boxes = await screen.findAllByRole("checkbox", { name: "حذف" });
    await userEvent.click(boxes[0]!); // clients.delete
    await userEvent.click(screen.getByRole("button", { name: "حفظ الدور" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT");
    expect((put?.body as { perms: string[] }).perms).toContain("clients.delete");
    expect(screen.getByText(/أرقام الأرباح مخفية/)).toBeInTheDocument();
  });

  it("the owner role is fixed", async () => {
    stubApi(base());
    await renderWithApp(<TeamPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "الأدوار والصلاحيات" }));
    await userEvent.click(await screen.findByRole("button", { name: /المالك/ }));
    expect(await screen.findByText(/دور المالك ثابت/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "حفظ الدور" })).toBeNull();
  });
});

describe("settings navigation by permission", () => {
  it("shows team and activity to those who may, hides them from members", async () => {
    stubApi(base("owner"));
    await renderWithApp(<SettingsLayout />);
    expect(await screen.findByRole("link", { name: /الفريق والصلاحيات/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /سجل النشاط/ })).toBeInTheDocument();
  });
  it("members see neither", async () => {
    stubApi(base("member"));
    await renderWithApp(<SettingsLayout />);
    await screen.findByRole("link", { name: /حسابي/ });
    expect(screen.queryByRole("link", { name: /الفريق والصلاحيات/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /سجل النشاط/ })).toBeNull();
  });
});
