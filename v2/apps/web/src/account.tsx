import { changePasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";
import { AppearanceCard } from "./theme";
import { button, card, field } from "./ui";

type Form = z.input<typeof changePasswordInput>;

/** «المظهر»: the colour mode. */
export function AppearancePage() {
  return <AppearanceCard />;
}

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
    <div className="space-y-6">
      <section className={`max-w-sm ${card}`}>
        <h1 className="mb-4 text-xl font-bold">تغيير كلمة المرور</h1>
        {msg && (
          <p
            role="alert"
            className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
          >
            {msg.text}
          </p>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
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
          <button type="submit" disabled={form.formState.isSubmitting} className={button}>
            حفظ
          </button>
        </form>
      </section>
    </div>
  );
}
