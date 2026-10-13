import { loginInput, setPasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";
import { AuthLayout, ErrorNote } from "./brand";
import { meQuery, setupStatusQuery } from "./session";
import { button, field } from "./ui";

type LoginForm = z.input<typeof loginInput>;
type SetupForm = { password: string; confirm: string };

export function LoginPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // An admin-issued invite link looks like /login?token=…
  const [setupToken] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("token"),
  );

  const needsSetup = useQuery(setupStatusQuery).data === true;
  const login = useForm<LoginForm>({ resolver: zodResolver(loginInput) });
  const setup = useForm<SetupForm>();

  const done = async () => {
    // Always ask the server who is signed in now (never trust a cached "signed out").
    await qc.fetchQuery({ ...meQuery, staleTime: 0 });
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
    <AuthLayout title={setupToken ? "تعيين كلمة المرور" : "تسجيل الدخول"}>
      {error && <ErrorNote>{error}</ErrorNote>}
      {setupToken ? (
        <form onSubmit={onSetup} className="space-y-4" noValidate>
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
        <form onSubmit={onLogin} className="space-y-4" noValidate>
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
      {needsSetup && !setupToken && (
        <p className="mt-6 text-center text-sm">
          <Link to="/setup" className="text-brand underline">
            إعداد أول مرة: إنشاء حساب المالك
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
