import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  Field,
  Input,
  Notice,
  Segmented,
  Select,
  Textarea,
  toast,
} from "../../components/ui";
import { ApiError } from "../../lib/format";
import { clientsQuery } from "../clients/api";
import { productQuery, productsQuery } from "../products/products-api";
import { assigneesQuery } from "../tasks/queries";
import { send } from "../team/queries";

type Similar = { id: string; name: string; code: string };
const blank = {
  clientId: "",
  entity: "",
  name: "",
  phone: "",
  email: "",
  productId: "",
  packageId: "",
  value: "",
  ownerId: "",
  followUpAt: "",
  message: "",
};

/**
 * «فرصة جديدة»: every opportunity belongs to a client — pick one, or create it here in one step.
 * The service, package, value, owner and first follow-up are optional and can come later.
 */
export function NewOpportunityDialog({
  open,
  onClose,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  /** Start from this client (e.g. from the client's page). */
  clientId?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [f, setF] = useState({ ...blank, clientId: clientId ?? "" });
  const [similar, setSimilar] = useState<Similar | null>(null);
  const [error, setError] = useState("");
  const clients = useQuery({ ...clientsQuery({ sort: "name" }), enabled: open });
  const products = useQuery({ ...productsQuery, enabled: open });
  const product = useQuery({ ...productQuery(f.productId), enabled: open && !!f.productId });
  const people = useQuery({ ...assigneesQuery, enabled: open });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  const close = () => {
    setF({ ...blank, clientId: clientId ?? "" });
    setSimilar(null);
    setError("");
    onClose();
  };
  const save = useMutation({
    mutationFn: async (confirmSimilarName: boolean) =>
      send<{ id: string }>("POST", "/api/product-requests", {
        ...(mode === "existing"
          ? { clientId: f.clientId }
          : {
              newClient: true,
              confirmSimilarName,
              entity: f.entity,
              phone: f.phone,
              email: f.email,
            }),
        name: f.name,
        productId: f.productId,
        packageId: f.productId ? f.packageId || packages[0]?.id || "" : "",
        value: Number(f.value) || 0,
        ownerId: f.ownerId,
        followUpAt: f.followUpAt,
        message: f.message,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["product-requests"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["sales-overview"] });
      toast("أُنشئت الفرصة");
      close();
      navigate({ to: "/sales/$id", params: { id: r.id } });
    },
    onError: (x) => {
      const code = x instanceof ApiError ? (x.body.error as string) : "";
      if (code === "similar_name")
        setSimilar(x instanceof ApiError ? (x.body.similar as Similar) : null);
      else
        setError(
          code === "client_archived"
            ? "هذا العميل مؤرشف: استعده أولاً."
            : code === "name_required"
              ? "اكتب اسم الجهة أو العميل."
              : "تعذّر الحفظ، راجع البيانات.",
        );
    },
  });
  const packages = product.data?.content.packages ?? [];
  const ready = mode === "existing" ? !!f.clientId : (f.entity || f.name).trim().length >= 2;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && close()}
      title="فرصة جديدة"
      footer={
        <DialogActions onCancel={close}>
          <Button type="submit" form="opportunity-form" disabled={!ready || save.isPending}>
            إنشاء الفرصة
          </Button>
        </DialogActions>
      }
    >
      <form
        id="opportunity-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(false);
        }}
      >
        {error && <Notice>{error}</Notice>}
        <Segmented<"existing" | "new">
          label="نوع العميل"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setSimilar(null);
          }}
          items={[
            { value: "existing", label: "عميل قائم" },
            { value: "new", label: "عميل جديد" },
          ]}
        />
        {mode === "existing" ? (
          <Field label="العميل">
            <Select value={f.clientId} onChange={set("clientId")} required>
              <option value="">— اختر العميل —</option>
              {(clients.data?.items ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed p-3">
            <Field label="اسم الجهة أو العميل">
              <Input value={f.entity} onChange={set("entity")} placeholder="مثلاً: جمعية البر" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الجوال">
                <Input dir="ltr" inputMode="tel" value={f.phone} onChange={set("phone")} />
              </Field>
              <Field label="البريد الإلكتروني">
                <Input dir="ltr" type="email" value={f.email} onChange={set("email")} />
              </Field>
            </div>
            <p className="text-xs text-muted">
              يُنشأ العميل بهذه البيانات ويظهر في «العملاء» كمحتمل.
            </p>
          </div>
        )}
        {similar && (
          <Notice tone="amber">
            يوجد عميل باسم مشابه: <b>{similar.name}</b> ({similar.code}).
            <span className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMode("existing");
                  setF((x) => ({ ...x, clientId: similar.id }));
                  setSimilar(null);
                }}
              >
                استخدم هذا العميل
              </Button>
              <Button type="button" variant="ghost" onClick={() => save.mutate(true)}>
                أنشئ عميلاً جديداً رغم ذلك
              </Button>
            </span>
          </Notice>
        )}
        <Field label="جهة الاتصال (اختياري)">
          <Input value={f.name} onChange={set("name")} placeholder="من نتحدث معه" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الخدمة">
            <Select
              value={f.productId}
              onChange={(e) => setF((x) => ({ ...x, productId: e.target.value, packageId: "" }))}
            >
              <option value="">— لم تُحدد —</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الباقة">
            <Select
              value={f.packageId || packages[0]?.id || ""}
              onChange={set("packageId")}
              disabled={!packages.length}
            >
              {!packages.length && <option value="">—</option>}
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="القيمة المتوقعة (ر.س)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={f.value}
              onChange={set("value")}
            />
          </Field>
          <Field label="المسؤول">
            <Select value={f.ownerId} onChange={set("ownerId")}>
              <option value="">— أنا لاحقاً —</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="أول متابعة">
            <Input type="date" value={f.followUpAt} onChange={set("followUpAt")} />
          </Field>
        </div>
        <Field label="ما الذي يحتاجونه؟">
          <Textarea rows={2} value={f.message} onChange={set("message")} />
        </Field>
      </form>
    </Dialog>
  );
}
