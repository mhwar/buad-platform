import { type ProjectInput, projectInput } from "@buad/schema/clients";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button, Dialog, Field, Input, Notice, Select, Textarea } from "../../components/ui";
import { ApiError, today } from "../../lib/format";
import { meQuery } from "../../session";
import { clientKeys, clientsQuery } from "../clients/api";
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "../labels";
import { productQuery, productsQuery } from "../products/products-api";
import { createProject, type ProjectDetail, projectKeys, updateProject } from "./api";

type Form = z.input<typeof projectInput>;
const msg: Record<string, string> = {
  required: "هذا الحقل مطلوب",
  end_before_start: "تاريخ الانتهاء قبل تاريخ البداية",
};
const err = (e?: { message?: string }) =>
  e?.message ? (msg[e.message] ?? "قيمة غير صحيحة") : undefined;

function toForm(clientId?: string, d?: ProjectDetail): Form {
  if (!d)
    return {
      clientId: clientId ?? "",
      name: "",
      type: "other",
      status: "active",
      visibility: "team",
      startDate: today(),
      expectedValue: 0,
      productId: "",
      packageId: "",
    };
  const p = d.project;
  return {
    clientId: p.clientId,
    name: p.name,
    type: p.type as Form["type"],
    status: p.status,
    visibility: p.visibility,
    location: p.location,
    startDate: p.startDate,
    endDate: p.endDate,
    payDate: p.payDate,
    expectedValue: p.expectedValue / 100,
    notes: p.notes,
    productId: d.service?.productId ?? "",
    packageId: d.service?.packageId ?? "",
  };
}

/**
 * Add or edit a project (app.html addProjectModal). Opened from a client page the client is
 * fixed and its picker hidden — exactly as in v1.
 */
export function ProjectDialog({
  open,
  onOpenChange,
  clientId,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId?: string;
  existing?: ProjectDetail;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const f = useForm<Form>({
    resolver: zodResolver(projectInput),
    values: toForm(clientId, existing),
  });
  const [error, setError] = useState<string | null>(null);
  const pickClient = !clientId && !existing;
  const clients = useQuery({
    ...clientsQuery({ sort: "name" }),
    enabled: open && (pickClient || !!existing),
  });
  const e = f.formState.errors;
  // Linking a project to a service and package is for managers (who can see the products).
  const me = useQuery(meQuery).data;
  const manager = !!me?.perms.includes("products.view");
  const products = useQuery({ ...productsQuery, enabled: open && manager });
  const productId = f.watch("productId") ?? "";
  const product = useQuery({ ...productQuery(productId), enabled: open && manager && !!productId });
  const services = (products.data ?? []).filter((x) => x.status !== "archived");

  const close = (v: boolean) => {
    if (!v) {
      setError(null);
      f.reset(toForm(clientId, existing));
    }
    onOpenChange(v);
  };

  const save = f.handleSubmit(async (v) => {
    setError(null);
    const body = { ...v } as ProjectInput;
    if (!manager) {
      // Never send an empty link on behalf of someone who cannot see the services.
      body.productId = undefined;
      body.packageId = undefined;
    }
    try {
      if (existing) {
        await updateProject(existing.project.id, body);
        await Promise.all([
          qc.invalidateQueries({ queryKey: projectKeys.all }),
          qc.invalidateQueries({ queryKey: clientKeys.all }),
        ]);
        close(false);
      } else {
        const res = await createProject(body);
        await Promise.all([
          qc.invalidateQueries({ queryKey: projectKeys.all }),
          qc.invalidateQueries({ queryKey: clientKeys.all }),
        ]);
        close(false);
        await navigate({ to: "/projects/$id", params: { id: res.id } });
      }
    } catch (x) {
      const code = x instanceof ApiError ? x.body.error : "";
      setError(
        code === "client_archived"
          ? "العميل مؤرشف. استعيدوه أولاً لإضافة مشروع له."
          : code === "end_before_start"
            ? "تاريخ الانتهاء قبل تاريخ البداية"
            : "تعذّر الحفظ، حاولوا مرة أخرى",
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={close} title={existing ? "تعديل المشروع" : "مشروع جديد"} wide>
      {error && <Notice>{error}</Notice>}
      <form onSubmit={save} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {(pickClient || existing) && (
            <Field label="العميل *" error={err(e.clientId)} className="sm:col-span-2">
              <Select {...f.register("clientId")} disabled={clients.isPending}>
                <option value="">اختر العميل…</option>
                {clients.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="اسم المشروع *" error={err(e.name)} className="sm:col-span-2">
            <Input autoFocus {...f.register("name")} />
          </Field>
          {manager && services.length > 0 && (
            <>
              <Field label="الخدمة / المنتج" hint="اختياري: لقياس أداء كل خدمة">
                <Select
                  {...f.register("productId", {
                    onChange: () => f.setValue("packageId", ""),
                  })}
                >
                  <option value="">بدون</option>
                  {services.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الباقة المتعاقد عليها">
                <Select {...f.register("packageId")} disabled={!productId || product.isPending}>
                  <option value="">{productId ? "بدون باقة محددة" : "اختر الخدمة أولاً"}</option>
                  {(product.data?.content.packages ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="نوع المشروع">
            <Select {...f.register("type")}>
              {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الحالة الحالية">
            <Select {...f.register("status")}>
              {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المدينة / الموقع">
            <Input {...f.register("location")} />
          </Field>
          <Field label="الظهور">
            <Select {...f.register("visibility")}>
              <option value="team">الفريق</option>
              <option value="private">خاص بي</option>
            </Select>
          </Field>
          <Field label="تاريخ البداية">
            <Input type="date" {...f.register("startDate")} />
          </Field>
          <Field label="تاريخ الانتهاء المتوقع" error={err(e.endDate)}>
            <Input type="date" {...f.register("endDate")} />
          </Field>
          <Field label="تاريخ استلام الدفعة المالية">
            <Input type="date" {...f.register("payDate")} />
          </Field>
          <Field
            label="قيمة العقد المتوقعة (ر.س)"
            error={e.expectedValue ? "أدخلوا رقماً صحيحاً" : undefined}
            hint={
              existing?.financeExists
                ? "تُدار الآن من «إعدادات العقد والميزانية»"
                : "قبل الضريبة؛ تصبح قيمة العقد في المالية"
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              disabled={existing?.financeExists}
              {...f.register("expectedValue")}
            />
          </Field>
        </div>
        <Field label="ملاحظات">
          <Textarea {...f.register("notes")} />
        </Field>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="secondary" onClick={() => close(false)}>
            إلغاء
          </Button>
          <Button type="submit" disabled={f.formState.isSubmitting}>
            {existing ? "حفظ التعديلات" : "حفظ المشروع"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
