import { changePasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";
import { Button, Card, Field, Input, Notice, PageHeader, toast } from "./components/ui";
import { AppearanceCard } from "./theme";

type Form = z.input<typeof changePasswordInput>;

const FAIL: Record<number, string> = {
  403: "كلمة المرور الحالية غير صحيحة.",
  429: "محاولات كثيرة متتالية. انتظروا دقيقة ثم أعيدوا المحاولة.",
};

/** «حسابي»: the person's own password, and the colour mode of this device. */
export function AccountPage() {
  const form = useForm<Form>({ resolver: zodResolver(changePasswordInput) });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await api.api.auth["change-password"].$post({ json: values });
    if (res.ok) {
      form.reset();
      return toast("تم تغيير كلمة المرور");
    }
    setError(FAIL[res.status] ?? "تعذّر تغيير كلمة المرور، حاولوا مرة أخرى.");
  });

  return (
    <div className="space-y-6">
      <PageHeader title="حسابي" subtitle="كلمة مرورك، ونمط الألوان على هذا الجهاز." />
      <Card className="max-w-xl">
        <h2 className="mb-1 text-lg font-bold">تغيير كلمة المرور</h2>
        <p className="mb-4 text-sm text-muted">تُسجَّل بعدها خارج المنصة في أجهزتك الأخرى.</p>
        {error && <Notice>{error}</Notice>}
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="كلمة المرور الحالية">
            <Input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              {...form.register("current")}
            />
          </Field>
          <Field
            label="كلمة المرور الجديدة"
            hint="8 أحرف على الأقل"
            error={form.formState.errors.password ? "8 أحرف على الأقل" : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              {...form.register("password")}
            />
          </Field>
          <div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              تغيير كلمة المرور
            </Button>
          </div>
        </form>
      </Card>
      <AppearanceCard />
    </div>
  );
}
