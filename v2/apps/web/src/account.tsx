import { changePasswordInput } from "@buad/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { api } from "./api";
import {
  Button,
  Card,
  confirmAction,
  Field,
  Input,
  Notice,
  PageHeader,
  toast,
} from "./components/ui";
import { fromEpoch, ok } from "./lib/format";
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
      <Card className="max-w-xl space-y-3">
        <div>
          <h2 className="text-lg font-bold">الأجهزة</h2>
          <p className="text-sm text-muted">
            إن فُقد جهاز أو دخلتم من جهاز عام، أخرِجوا كل الأجهزة الأخرى. يبقى هذا الجهاز داخلاً.
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={async () => {
              if (
                !(await confirmAction({
                  title: "الخروج من كل الأجهزة الأخرى؟",
                  text: "سيلزم تسجيل الدخول من جديد في أي جهاز آخر.",
                  action: "إخراج الأجهزة الأخرى",
                }))
              )
                return;
              const res = await fetch("/api/auth/logout-others", { method: "POST" });
              if (res.ok) toast("خرجت كل الأجهزة الأخرى");
              else setError("تعذّر إخراج الأجهزة الأخرى، حاولوا مرة أخرى.");
            }}
          >
            خروج من كل الأجهزة الأخرى
          </Button>
        </div>
      </Card>
      <RecoveryKeyCard />
      <AppearanceCard />
    </div>
  );
}

/**
 * «مفتاح الاستعادة»: made here, shown once, kept offline. With it, «نسيت كلمة المرور؟» on the
 * sign-in page sets a new password without anyone else's help.
 */
function RecoveryKeyCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["recovery-key"],
    queryFn: async () =>
      ok<{ exists: boolean; createdAt: number | null }>(await fetch("/api/auth/recovery-key")),
  });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (
      status.data?.exists &&
      !(await confirmAction({
        title: "إنشاء مفتاح جديد؟",
        text: "المفتاح القديم يتوقف عن العمل فوراً.",
        action: "إنشاء مفتاح جديد",
      }))
    )
      return;
    setBusy(true);
    try {
      const res = await ok<{ key: string }>(
        await fetch("/api/auth/recovery-key", { method: "POST" }),
      );
      setKey(res.key);
      qc.invalidateQueries({ queryKey: ["recovery-key"] });
    } catch {
      toast("تعذّر إنشاء المفتاح، حاولوا مرة أخرى", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-xl space-y-3" aria-label="مفتاح الاستعادة">
      <div>
        <h2 className="text-lg font-bold">مفتاح الاستعادة</h2>
        <p className="text-sm text-muted">
          إن نسيتم كلمة المرور، يتيح لكم هذا المفتاح اختيار كلمة جديدة من صفحة الدخول («نسيت كلمة
          المرور؟») دون مساعدة أحد. يُعرض مرة واحدة فقط ويعمل مرة واحدة، فاحفظوه في مكان آمن خارج
          المنصة.
        </p>
      </div>
      {key ? (
        <div className="space-y-2 rounded-xl border border-warning-line bg-warning-soft p-4">
          <p className="text-sm font-semibold">احفظوا المفتاح الآن، فلن يظهر مرة أخرى:</p>
          <p
            className="select-all text-center font-mono text-xl font-bold tracking-wider"
            dir="ltr"
          >
            {key}
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(key).catch(() => undefined);
              toast("نُسخ المفتاح");
            }}
          >
            نسخ المفتاح
          </Button>
        </div>
      ) : (
        <p className="text-sm">
          {status.data?.exists
            ? `لديكم مفتاح فعّال${status.data.createdAt ? ` منذ ${fromEpoch(status.data.createdAt)}` : ""}.`
            : "لا يوجد مفتاح بعد."}
        </p>
      )}
      <div>
        <Button
          variant={status.data?.exists ? "secondary" : "primary"}
          onClick={make}
          disabled={busy}
        >
          {status.data?.exists ? "إنشاء مفتاح جديد" : "إنشاء مفتاح استعادة"}
        </Button>
      </div>
    </Card>
  );
}
