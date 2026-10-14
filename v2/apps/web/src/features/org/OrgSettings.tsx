import { orgProfilePatch } from "@buad/schema/org";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Field, Input, Notice, PageHeader } from "../../components/ui";
import { ApiError, ok } from "../../lib/format";
import { meQuery } from "../../session";

type Profile = z.output<z.ZodObject<Omit<typeof orgProfilePatch.shape, "version">>> & {
  version: number;
  urls: Record<ImageField, string>;
};
type ImageField = "logoAsset" | "stampAsset" | "signatureAsset" | "headerAsset" | "footerAsset";
const formSchema = orgProfilePatch.omit({ version: true });
type Form = z.input<typeof formSchema>;

export const orgProfileQuery = queryOptions({
  queryKey: ["org-profile"],
  queryFn: async () => (await ok<{ profile: Profile }>(await fetch("/api/org/profile"))).profile,
  staleTime: 5 * 60_000,
});

async function uploadImage(file: File): Promise<{ id: string; url: string }> {
  return ok(
    await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    }),
  );
}

const TEXT: { key: keyof Form; label: string; dir?: "ltr"; wide?: boolean }[] = [
  { key: "name", label: "اسم الجهة", wide: true },
  { key: "reg", label: "رقم السجل التجاري", dir: "ltr" },
  { key: "tax", label: "الرقم الضريبي", dir: "ltr" },
  { key: "phone", label: "الهاتف", dir: "ltr" },
  { key: "email", label: "البريد الإلكتروني", dir: "ltr" },
  { key: "website", label: "الموقع الإلكتروني", dir: "ltr" },
  { key: "address", label: "العنوان", wide: true },
];
const SIGNER: typeof TEXT = [
  { key: "signerName", label: "اسم المفوض بالتوقيع" },
  { key: "signerTitle", label: "صفته" },
  { key: "signerId", label: "رقم الهوية", dir: "ltr" },
];
const BANK: typeof TEXT = [
  { key: "bankName", label: "اسم البنك" },
  { key: "bankIban", label: "رقم الآيبان", dir: "ltr" },
];
const IMAGES: { key: ImageField; label: string; hint: string; wide?: boolean }[] = [
  { key: "logoAsset", label: "شعار الجهة", hint: "يظهر في أغلفة العقود والخطابات" },
  { key: "stampAsset", label: "الختم", hint: "PNG بخلفية شفافة أفضل" },
  { key: "signatureAsset", label: "التوقيع", hint: "PNG بخلفية شفافة" },
  { key: "headerAsset", label: "الترويسة (رأس الصفحة)", hint: "صورة عرضية بعرض A4", wide: true },
  { key: "footerAsset", label: "تذييل الصفحة", hint: "صورة عرضية بعرض A4", wide: true },
];

/** «إعدادات الجهة»: the organisation identity every contract and letter uses (set once). */
export function OrgSettingsPage() {
  const qc = useQueryClient();
  const me = useQuery(meQuery).data;
  const canEdit = me?.role === "owner" || me?.role === "admin";
  const q = useQuery(orgProfileQuery);
  const f = useForm<Form>({ resolver: zodResolver(formSchema) });
  const [notice, setNotice] = useState<{ tone: "red" | "amber"; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<ImageField | null>(null);

  useEffect(() => {
    if (q.data) {
      const { urls: _u, version: _v, ...values } = q.data;
      f.reset(values);
    }
  }, [q.data, f]);

  const save = async (patch: Form) => {
    if (!q.data) return;
    setNotice(null);
    setSaved(false);
    try {
      const res = await ok<{ profile: Profile }>(
        await fetch("/api/org/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...patch, version: q.data.version }),
        }),
      );
      qc.setQueryData(orgProfileQuery.queryKey, res.profile);
      setSaved(true);
    } catch (x) {
      setNotice(
        x instanceof ApiError && x.body.error === "stale"
          ? {
              tone: "amber",
              text: "عدّل مستخدم آخر البيانات للتو، فعُرضت أحدث نسخة. أعيدوا تعديلكم.",
            }
          : { tone: "red", text: "تعذّر الحفظ" },
      );
      await qc.invalidateQueries({ queryKey: orgProfileQuery.queryKey });
    }
  };

  const pick = async (key: ImageField, file?: File) => {
    if (!file) return;
    setBusy(key);
    setNotice(null);
    try {
      const a = await uploadImage(file);
      await save({ [key]: a.id });
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setNotice({
        tone: "red",
        text:
          code === "too_large"
            ? "الصورة أكبر من 2 ميجابايت"
            : code === "unsupported_type"
              ? "الصيغة غير مدعومة (PNG أو JPG أو WEBP أو SVG)"
              : "تعذّر رفع الصورة",
      });
    } finally {
      setBusy(null);
    }
  };

  if (q.isPending) return <p className="text-muted">جارٍ التحميل…</p>;
  if (!q.data) return <Notice>تعذّر تحميل إعدادات الجهة</Notice>;
  const p = q.data;
  const fields = (list: typeof TEXT) =>
    list.map((t) => (
      <Field key={t.key} label={t.label} className={t.wide ? "sm:col-span-2" : ""}>
        <Input dir={t.dir} disabled={!canEdit} {...f.register(t.key)} />
      </Field>
    ));

  return (
    <>
      <PageHeader title="إعدادات الجهة" subtitle="هوية مؤسستكم في كل عقد وخطاب: تُضبط مرة واحدة" />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!canEdit && <Notice tone="amber">للاطلاع فقط. التعديل للمالك والمدراء.</Notice>}
      <form
        onSubmit={f.handleSubmit(save)}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">بيانات الجهة</h2>
            <div className="grid gap-4 sm:grid-cols-2">{fields(TEXT)}</div>
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">المفوض بالتوقيع</h2>
            <div className="grid gap-4 sm:grid-cols-3">{fields(SIGNER)}</div>
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">البيانات البنكية</h2>
            <div className="grid gap-4 sm:grid-cols-2">{fields(BANK)}</div>
          </Card>
          {canEdit && (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={f.formState.isSubmitting || !f.formState.isDirty}>
                حفظ البيانات
              </Button>
              {saved && !f.formState.isDirty && (
                <span className="text-sm text-emerald-700 dark:text-emerald-400">حُفظ ✓</span>
              )}
            </div>
          )}
        </div>

        <Card className="lg:sticky lg:top-24">
          <h2 className="mb-1 font-semibold">الصور والترويسة</h2>
          <p className="mb-4 text-xs text-muted">تُرفع مرة واحدة وتُستخدم في كل المستندات.</p>
          <div className="grid grid-cols-3 gap-3">
            {IMAGES.filter((i) => !i.wide).map((i) => (
              <ImageSlot
                key={i.key}
                field={i.key}
                label={i.label}
                hint={i.hint}
                url={p.urls[i.key]}
                busy={busy === i.key}
                canEdit={canEdit}
                onPick={(file) => pick(i.key, file)}
                onClear={() => save({ [i.key]: "" })}
              />
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {IMAGES.filter((i) => i.wide).map((i) => (
              <ImageSlot
                key={i.key}
                field={i.key}
                wide
                label={i.label}
                hint={i.hint}
                url={p.urls[i.key]}
                busy={busy === i.key}
                canEdit={canEdit}
                onPick={(file) => pick(i.key, file)}
                onClear={() => save({ [i.key]: "" })}
              />
            ))}
          </div>
        </Card>
      </form>
    </>
  );
}

function ImageSlot({
  field,
  label,
  hint,
  url,
  wide,
  busy,
  canEdit,
  onPick,
  onClear,
}: {
  field: ImageField;
  label: string;
  hint: string;
  url: string;
  wide?: boolean;
  busy: boolean;
  canEdit: boolean;
  onPick: (f?: File) => void;
  onClear: () => void;
}) {
  const id = `img-${field}`;
  return (
    <div className="text-xs">
      <p className="mb-1 font-medium">{label}</p>
      <label
        htmlFor={canEdit ? id : undefined}
        className={`grid place-items-center overflow-hidden rounded-xl border border-dashed bg-white ${wide ? "h-20" : "aspect-square"} ${canEdit ? "cursor-pointer hover:border-brand" : ""}`}
        title={hint}
      >
        {busy ? (
          <span className="text-muted">جارٍ الرفع…</span>
        ) : url ? (
          <img src={url} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-muted">
            <ImagePlus className="size-5" />
            {canEdit ? "رفع" : "—"}
          </span>
        )}
      </label>
      {canEdit && (
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      )}
      {url && canEdit && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 inline-flex items-center gap-1 text-muted hover:text-red-600"
        >
          <Trash2 className="size-3" /> إزالة
        </button>
      )}
      <p className="mt-0.5 text-muted">{hint}</p>
    </div>
  );
}
