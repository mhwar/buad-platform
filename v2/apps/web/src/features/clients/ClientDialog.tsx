import { type ClientInput, clientInput } from "@buad/schema/clients";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button, Dialog, Field, Input, Notice, Select, Textarea } from "../../components/ui";
import { ApiError } from "../../lib/format";
import { CLIENT_TYPE_LABELS } from "../labels";
import {
  type ClientDetail,
  checkDuplicate,
  clientKeys,
  createClient,
  type Dup,
  updateClient,
} from "./api";

type Form = z.input<typeof clientInput>;
const MAX_LOGO_BYTES = 200 * 1024;

const msg: Record<string, string> = {
  required: "هذا الحقل مطلوب",
  invalid_email: "بريد إلكتروني غير صحيح",
};
const err = (e?: { message?: string }) =>
  e?.message ? (msg[e.message] ?? "قيمة غير صحيحة") : undefined;

function toForm(d?: ClientDetail): Form {
  if (!d) return { name: "", type: "company", contacts: [] };
  const c = d.client;
  const sig = d.contacts.find((x) => x.isSignatory);
  return {
    name: c.name,
    type: c.type,
    email: c.email,
    phone: c.phone,
    city: c.city,
    regNo: c.regNo,
    taxNo: c.taxNo,
    address: c.address,
    website: c.website,
    notes: c.notes,
    logo: c.logo,
    signatoryName: sig?.name ?? "",
    signatoryTitle: sig?.title ?? "",
    contacts: d.contacts
      .filter((x) => !x.isSignatory)
      .map(({ name, title, phone, email }) => ({ name, title, phone, email })),
  };
}

/** Add or edit a client. Same fields and labels as v1 (app.html addClientModal). */
export function ClientDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: ClientDetail;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const f = useForm<Form>({ resolver: zodResolver(clientInput), values: toForm(existing) });
  const contacts = useFieldArray({ control: f.control, name: "contacts" });
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Dup | null>(null);
  const [similar, setSimilar] = useState<Dup | null>(null);
  const logo = f.watch("logo");
  const e = f.formState.errors;

  const close = (v: boolean) => {
    if (!v) {
      setError(null);
      setDuplicate(null);
      setSimilar(null);
      f.reset(toForm(existing));
    }
    onOpenChange(v);
  };

  // Early, friendly warning while typing CR/VAT (the server enforces it anyway).
  const precheck = async () => {
    const { regNo, taxNo } = f.getValues();
    if (!regNo && !taxNo) return setDuplicate(null);
    const r = await checkDuplicate({
      regNo: regNo ?? "",
      taxNo: taxNo ?? "",
      selfId: existing?.client.id ?? "",
    }).catch(() => null);
    setDuplicate(r?.duplicate ?? null);
  };

  const pickLogo = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return setError("حجم الشعار أكبر من 200 كيلوبايت");
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type))
      return setError("صيغة الشعار غير مدعومة (PNG أو JPG أو WEBP أو SVG)");
    const r = new FileReader();
    r.onload = () => f.setValue("logo", String(r.result), { shouldDirty: true });
    r.readAsDataURL(file);
  };

  const save = async (v: Form, confirmSimilarName = false) => {
    setError(null);
    try {
      if (existing) {
        await updateClient(existing.client.id, { ...v, confirmSimilarName });
        await qc.invalidateQueries({ queryKey: clientKeys.all });
        close(false);
      } else {
        const res = await createClient({ ...(v as ClientInput), confirmSimilarName });
        await qc.invalidateQueries({ queryKey: clientKeys.all });
        close(false);
        await navigate({ to: "/clients/$id", params: { id: res.id } });
      }
    } catch (x) {
      if (x instanceof ApiError && x.body.error === "duplicate")
        return setDuplicate(x.body.duplicate as Dup);
      if (x instanceof ApiError && x.body.error === "similar_name")
        return setSimilar(x.body.similar as Dup);
      setError("تعذّر الحفظ، حاولوا مرة أخرى");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={existing ? "تعديل بيانات العميل" : "عميل جديد"}
      wide
    >
      {error && <Notice>{error}</Notice>}
      {duplicate && (
        <Notice>
          {duplicate.field === "taxNo" ? "الرقم الضريبي" : "رقم السجل"} مسجّل للعميل{" "}
          <Link
            to="/clients/$id"
            params={{ id: duplicate.id }}
            className="font-semibold underline"
            onClick={() => close(false)}
          >
            {duplicate.name} ({duplicate.code})
          </Link>
          {duplicate.archivedAt ? " — مؤرشف" : ""}. لا يمكن تكرار هذا الرقم.
        </Notice>
      )}
      {similar && (
        <Notice tone="amber">
          <p>
            يوجد عميل باسم مشابه:{" "}
            <Link
              to="/clients/$id"
              params={{ id: similar.id }}
              className="font-semibold underline"
              onClick={() => close(false)}
            >
              {similar.name} ({similar.code})
            </Link>
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={f.handleSubmit((v) => save(v, true))}>
              نعم، عميل مختلف — تابع الحفظ
            </Button>
            <Button variant="ghost" onClick={() => setSimilar(null)}>
              مراجعة
            </Button>
          </div>
        </Notice>
      )}
      <form onSubmit={f.handleSubmit((v) => save(v))} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العميل *" error={err(e.name)} className="sm:col-span-2">
            <Input autoFocus {...f.register("name")} />
          </Field>
          <Field label="نوع العميل">
            <Select {...f.register("type")}>
              {Object.entries(CLIENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المدينة">
            <Input {...f.register("city")} />
          </Field>
          <Field label="البريد الإلكتروني" error={err(e.email)}>
            <Input type="email" dir="ltr" {...f.register("email")} />
          </Field>
          <Field label="رقم الهاتف">
            <Input type="tel" dir="ltr" {...f.register("phone")} />
          </Field>
          <Field label="رقم السجل / الترخيص">
            <Input dir="ltr" {...f.register("regNo", { onBlur: precheck })} />
          </Field>
          <Field label="الرقم الضريبي">
            <Input dir="ltr" {...f.register("taxNo", { onBlur: precheck })} />
          </Field>
          <Field label="العنوان الوطني" className="sm:col-span-2">
            <Input {...f.register("address")} />
          </Field>
          <Field label="اسم الممثل المفوض">
            <Input {...f.register("signatoryName")} />
          </Field>
          <Field label="صفة الممثل">
            <Input {...f.register("signatoryTitle")} />
          </Field>
          <Field label="الموقع الإلكتروني">
            <Input type="url" dir="ltr" placeholder="https://" {...f.register("website")} />
          </Field>
          <div className="text-sm">
            <label htmlFor="client-logo" className="mb-1 block font-medium">
              شعار العميل
            </label>
            <div className="flex items-center gap-3">
              {logo && (
                <img
                  src={logo}
                  alt=""
                  className="size-11 rounded-lg border bg-white object-contain p-1"
                />
              )}
              {/* Native file inputs show browser-language text; a styled label keeps it Arabic. */}
              <input
                id="client-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                aria-describedby="client-logo-hint"
                onChange={(ev) => pickLogo(ev.target.files?.[0])}
                className="peer sr-only"
              />
              <label
                htmlFor="client-logo"
                className="cursor-pointer rounded-lg border bg-surface px-3.5 py-2 text-sm font-semibold transition hover:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              >
                {logo ? "تغيير الشعار" : "اختيار ملف"}
              </label>
              {logo && (
                <Button
                  variant="ghost"
                  onClick={() => f.setValue("logo", "", { shouldDirty: true })}
                >
                  إزالة
                </Button>
              )}
            </div>
            <span id="client-logo-hint" className="mt-1 block text-xs text-muted">
              PNG أو JPG أو WEBP أو SVG، حتى 200 كيلوبايت
            </span>
          </div>
        </div>

        <fieldset className="rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">جهات اتصال إضافية</legend>
          {contacts.fields.length === 0 && (
            <p className="text-sm text-muted">لا توجد. يمكنكم إضافة منسّق أو مسؤول مالي مثلاً.</p>
          )}
          <div className="space-y-3">
            {contacts.fields.map((c, i) => (
              <div key={c.id} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Field label="الاسم">
                  <Input {...f.register(`contacts.${i}.name`)} />
                </Field>
                <Field label="الصفة">
                  <Input {...f.register(`contacts.${i}.title`)} />
                </Field>
                <Field label="الهاتف">
                  <Input dir="ltr" {...f.register(`contacts.${i}.phone`)} />
                </Field>
                <Button
                  variant="ghost"
                  aria-label="حذف جهة الاتصال"
                  onClick={() => contacts.remove(i)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          {contacts.fields.length < 20 && (
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => contacts.append({ name: "", title: "", phone: "", email: "" })}
            >
              <Plus className="size-4" /> إضافة جهة اتصال
            </Button>
          )}
        </fieldset>

        <Field label="ملاحظات">
          <Textarea {...f.register("notes")} />
        </Field>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="secondary" onClick={() => close(false)}>
            إلغاء
          </Button>
          <Button type="submit" disabled={f.formState.isSubmitting || !!duplicate}>
            {existing ? "حفظ التعديلات" : "حفظ العميل"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
