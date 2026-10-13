import { loginInput, setPasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";

type LoginForm = z.input<typeof loginInput>;
type SetupForm = { password: string; confirm: string };

const field = "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand";
const button = "w-full rounded-md bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60";

export function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // An admin-issued invite link looks like /login?token=…
  const [setupToken] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("token"),
  );

  const login = useForm<LoginForm>({ resolver: zodResolver(loginInput) });
  const setup = useForm<SetupForm>();

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["me"] });
    await navigate({ to: "/" });
  };

  const onLogin = login.handleSubmit(async (values) => {
    setError(null);
    const res = await api.api.auth.login.$post({ json: values });
    const body = await res.json();
    if (!res.ok || !("ok" in body) || !body.ok)
      return setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    await done();
  });

  const onSetup = setup.handleSubmit(async ({ password, confirm }) => {
    setError(null);
    if (password !== confirm) return setError("كلمتا المرور غير متطابقتين");
    const parsed = setPasswordInput.safeParse({ setupToken, password });
    if (!parsed.success) return setError("كلمة المرور يجب ألا تقل عن 8 أحرف");
    const res = await api.api.auth["setup-password"].$post({ json: parsed.data });
    if (!res.ok) return setError("انتهت صلاحية الرابط، حاول تسجيل الدخول من جديد");
    await done();
  });

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-bold">
        {setupToken ? "تعيين كلمة المرور" : "تسجيل الدخول"}
      </h1>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {setupToken ? (
        <form onSubmit={onSetup} className="space-y-3" noValidate>
          <label className="block text-sm">
            كلمة المرور الجديدة
            <input
              type="password"
              autoComplete="new-password"
              className={field}
              {...setup.register("password")}
            />
          </label>
          <label className="block text-sm">
            تأكيد كلمة المرور
            <input
              type="password"
              autoComplete="new-password"
              className={field}
              {...setup.register("confirm")}
            />
          </label>
          <button type="submit" className={button} disabled={setup.formState.isSubmitting}>
            حفظ ودخول
          </button>
        </form>
      ) : (
        <form onSubmit={onLogin} className="space-y-3" noValidate>
          <label className="block text-sm">
            البريد الإلكتروني
            <input
              type="email"
              autoComplete="username"
              dir="ltr"
              className={field}
              {...login.register("email")}
            />
            {login.formState.errors.email && (
              <span className="text-xs text-red-600">أدخل بريداً إلكترونياً صحيحاً</span>
            )}
          </label>
          <label className="block text-sm">
            كلمة المرور
            <input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              className={field}
              {...login.register("password")}
            />
          </label>
          <button type="submit" className={button} disabled={login.formState.isSubmitting}>
            دخول
          </button>
        </form>
      )}
    </div>
  );
}
