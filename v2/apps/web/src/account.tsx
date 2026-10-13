import { changePasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";

type Form = z.input<typeof changePasswordInput>;
const field = "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand";

export function AccountPage() {
  const form = useForm<Form>({ resolver: zodResolver(changePasswordInput) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = form.handleSubmit(async (values) => {
    const res = await api.api.auth["change-password"].$post({ json: values });
    if (res.ok) {
      form.reset();
      return setMsg({ ok: true, text: "تم تغيير كلمة المرور" });
    }
    setMsg({
      ok: false,
      text: res.status === 403 ? "كلمة المرور الحالية غير صحيحة" : "تعذّر التغيير",
    });
  });

  return (
    <section className="max-w-sm rounded-lg border bg-white p-6">
      <h1 className="mb-4 text-xl font-bold">تغيير كلمة المرور</h1>
      {msg && (
        <p
          role="alert"
          className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {msg.text}
        </p>
      )}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <label className="block text-sm">
          كلمة المرور الحالية
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            className={field}
            {...form.register("current")}
          />
        </label>
        <label className="block text-sm">
          كلمة المرور الجديدة (8 أحرف على الأقل)
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className={field}
            {...form.register("password")}
          />
          {form.formState.errors.password && (
            <span className="text-xs text-red-600">8 أحرف على الأقل</span>
          )}
        </label>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full rounded-md bg-brand px-3 py-2 font-semibold text-white disabled:opacity-60"
        >
          حفظ
        </button>
      </form>
    </section>
  );
}
