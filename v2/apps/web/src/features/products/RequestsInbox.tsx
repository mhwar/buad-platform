import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Phone, Plus } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Notice,
  Pills,
  Select,
  Textarea,
} from "../../components/ui";
import { ago, ok, whatsapp } from "../../lib/format";
import {
  type ProductListItem,
  type ProductRequest,
  REQUEST_LABEL,
  type RequestStatus,
  requestsQuery,
  sendJson,
} from "./products-api";

const TONE: Record<RequestStatus, "blue" | "amber" | "green" | "gray" | "red"> = {
  new: "blue",
  contacted: "amber",
  quoted: "amber",
  won: "green",
  lost: "gray",
};

/** «الطلبات»: quote requests from the website (or logged by hand), to follow up. */
export function RequestsInbox({ products }: { products: ProductListItem[] }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RequestStatus | "">("");
  const q = useQuery(requestsQuery(status));
  const all = useQuery(requestsQuery(""));
  const [adding, setAdding] = useState(false);
  const counts = all.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["product-requests"] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pills<RequestStatus>
          value={status}
          onChange={setStatus}
          items={[
            { value: "", label: "الكل", count: total },
            ...(Object.keys(REQUEST_LABEL) as RequestStatus[]).map((k) => ({
              value: k,
              label: REQUEST_LABEL[k],
              count: counts[k] ?? 0,
            })),
          ]}
        />
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> تسجيل طلب يدوياً
        </Button>
      </div>
      {q.isError && <Notice>تعذّر تحميل الطلبات</Notice>}
      {q.isPending ? (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      ) : q.data?.requests.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات"
          text="تصلك هنا طلبات «اطلب عرضاً» من الموقع، ويمكنك تسجيل أي استفسار وصلك بوسيلة أخرى."
        />
      ) : (
        q.data?.requests.map((r) => <RequestCard key={r.id} r={r} onChanged={refresh} />)
      )}
      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        products={products}
        onDone={refresh}
      />
    </div>
  );
}

function RequestCard({ r, onChanged }: { r: ProductRequest; onChanged: () => void }) {
  const [notes, setNotes] = useState(r.notes);
  const patch = useMutation({
    mutationFn: async (body: Partial<{ status: RequestStatus; notes: string }>) =>
      ok(await sendJson(`/api/product-requests/${r.id}`, "PATCH", body)),
    onSuccess: onChanged,
  });
  const wa = whatsapp(r.phone);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">
            {r.name}
            {r.entity && <span className="font-normal text-muted"> · {r.entity}</span>}
          </h3>
          <p className="text-xs text-muted">
            {r.productName || "طلب عام"} · {ago(r.createdAt)} ·{" "}
            {r.source === "site" ? "من الموقع" : "يدوي"}
          </p>
        </div>
        <Badge tone={TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {r.phone && (
          <a
            href={`tel:${r.phone}`}
            dir="ltr"
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:bg-brand-soft"
          >
            <Phone className="size-3.5" /> {r.phone}
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:bg-brand-soft"
          >
            <MessageCircle className="size-3.5" /> واتساب
          </a>
        )}
        {r.email && (
          <a
            href={`mailto:${r.email}`}
            dir="ltr"
            className="rounded-lg border px-2.5 py-1 hover:bg-brand-soft"
          >
            {r.email}
          </a>
        )}
      </div>
      {Object.keys(r.answers).length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-canvas/60 p-3 text-sm sm:grid-cols-2">
          {Object.entries(r.answers).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {r.message && <p className="text-sm">{r.message}</p>}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field label="الحالة">
          <Select
            value={r.status}
            onChange={(e) => patch.mutate({ status: e.target.value as RequestStatus })}
          >
            {(Object.keys(REQUEST_LABEL) as RequestStatus[]).map((k) => (
              <option key={k} value={k}>
                {REQUEST_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ملاحظات المتابعة">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== r.notes && patch.mutate({ notes })}
          />
        </Field>
      </div>
    </Card>
  );
}

function AddDialog({
  open,
  onClose,
  products,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductListItem[];
  onDone: () => void;
}) {
  const [f, setF] = useState({
    name: "",
    entity: "",
    phone: "",
    email: "",
    message: "",
    productSlug: "",
  });
  const [error, setError] = useState("");
  const add = useMutation({
    mutationFn: async () =>
      ok(
        await sendJson("/api/product-requests", "POST", {
          ...f,
          productSlug: f.productSlug || undefined,
        }),
      ),
    onSuccess: () => {
      onDone();
      setF({ name: "", entity: "", phone: "", email: "", message: "", productSlug: "" });
      setError("");
      onClose();
    },
    onError: () => setError("اكتب الاسم، ورقم جوال أو بريداً إلكترونياً"),
  });
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="تسجيل طلب">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        {error && <Notice>{error}</Notice>}
        <Field label="الاسم">
          <Input value={f.name} onChange={set("name")} />
        </Field>
        <Field label="الجهة">
          <Input value={f.entity} onChange={set("entity")} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الجوال">
            <Input dir="ltr" value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input dir="ltr" value={f.email} onChange={set("email")} />
          </Field>
        </div>
        <Field label="المنتج">
          <Select value={f.productSlug} onChange={set("productSlug")}>
            <option value="">عام</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ملاحظات">
          <Textarea rows={3} value={f.message} onChange={set("message")} />
        </Field>
        <Button
          type="submit"
          className="w-full"
          disabled={add.isPending || f.name.trim().length < 2}
        >
          حفظ
        </Button>
      </form>
    </Dialog>
  );
}
