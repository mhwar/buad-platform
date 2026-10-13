import { ownerSetupInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "./api";
import { AuthLayout, ErrorNote } from "./brand";
import { button, field } from "./ui";

const form = ownerSetupInput
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "mismatch",
  });
type Form = z.input<typeof form>;

const messages: Record<number, string> = {
  403: "رمز الإعداد غير صحيح",
  404: "الإعداد غير مفعّل: لم يُضبط رمز الإعداد على الخادم",
  409: "تم إعداد حساب المالك مسبقاً. سجّلوا الدخول",
};

export function SetupPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const f = useForm<Form>({ resolver: zodResolver(form) });
  const errs = f.formState.errors;

  const submit = f.handleSubmit(async ({ confirm: _c, ...json }) => {
    setError(null);
    const res = await api.api.setup.owner.$post({ json });
    if (!res.ok) return setError(messages[res.status] ?? "تعذّر الإعداد، حاولوا مرة أخرى");
    await qc.invalidateQueries({ queryKey: ["me"] });
    await qc.invalidateQueries({ queryKey: ["setup-status"] });
    await navigate({ to: "/" });
  });

  const hint = "mt-1 block text-xs text-red-600";
  return (
    <AuthLayout title="إعداد حساب المالك">
      <p className="mb-5 text-sm text-muted">
        تُجرى هذه الخطوة مرة واحدة فقط. أدخلوا رمز الإعداد الذي وضعتموه في إعدادات النشر.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm">
          رمز الإعداد
          <input
            type="password"
            autoComplete="off"
            dir="ltr"
            className={field}
            {...f.register("token")}
          />
        </label>
        <label className="block text-sm">
          الاسم
          <input type="text" autoComplete="name" className={field} {...f.register("name")} />
          {errs.name && <span className={hint}>الاسم مطلوب</span>}
        </label>
        <label className="block text-sm">
          البريد الإلكتروني
          <input
            type="email"
            autoComplete="username"
            dir="ltr"
            className={field}
            {...f.register("email")}
          />
          {errs.email && <span className={hint}>أدخلوا بريداً إلكترونياً صحيحاً</span>}
        </label>
        <label className="block text-sm">
          كلمة المرور (12 حرفاً فأكثر)
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className={field}
            {...f.register("password")}
          />
          {errs.password && <span className={hint}>12 حرفاً على الأقل</span>}
        </label>
        <label className="block text-sm">
          تأكيد كلمة المرور
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            className={field}
            {...f.register("confirm")}
          />
          {errs.confirm && <span className={hint}>كلمتا المرور غير متطابقتين</span>}
        </label>
        <button type="submit" className={button} disabled={f.formState.isSubmitting}>
          إنشاء الحساب والدخول
        </button>
      </form>
    </AuthLayout>
  );
}
