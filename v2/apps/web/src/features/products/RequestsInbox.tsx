import { type PricingIn, packageQuote } from "@buad/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { ApiError, ago, ok, sar, whatsapp } from "../../lib/format";
import { QuoteResult } from "./PricingPanel";
import {
  type ProductListItem,
  type ProductRequest,
  productQuery,
  REQUEST_LABEL,
  type RequestStatus,
  requestsQuery,
  sendJson,
} from "./products-api";

const TONE: Record<RequestStatus, "blue" | "amber" | "green" | "gray" | "red"> = {
  new: "blue",
  contacted: "amber",
  quoted: "amber",
  negotiating: "amber",
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
        q.data?.requests.map((r) => (
          <RequestCard key={r.id} r={r} products={products} onChanged={refresh} />
        ))
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

function RequestCard({
  r,
  products,
  onChanged,
}: {
  r: ProductRequest;
  products: ProductListItem[];
  onChanged: () => void;
}) {
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
        <span className="flex gap-1.5">
          {r.interest && <Badge tone="blue">تسجيل اهتمام</Badge>}
          <Badge tone={TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>
        </span>
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
      <QuoteBlock r={r} products={products} onChanged={onChanged} />
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

type QuoteSnap = {
  productName?: string;
  packageName?: string;
  times?: number;
  price?: number;
  vat?: number;
  total?: number;
  cost?: number;
  profit?: number;
  marginPct?: number;
};

/** The priced offer on a request, and the step that turns the request into a client and project. */
function QuoteBlock({
  r,
  products,
  onChanged,
}: {
  r: ProductRequest;
  products: ProductListItem[];
  onChanged: () => void;
}) {
  const [quoting, setQuoting] = useState(false);
  const [converting, setConverting] = useState(false);
  const q = r.quote as QuoteSnap;
  const hasQuote = typeof q.price === "number";
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-3 text-sm">
      {hasQuote && (
        <div className="space-y-1">
          <p className="font-semibold">
            عرض السعر: {q.packageName} × {q.times}
          </p>
          <p>
            السعر {sar(q.price ?? 0)} قبل الضريبة · الإجمالي {sar(q.total ?? 0)}
          </p>
          <p className="text-xs text-muted">
            التكلفة {sar(q.cost ?? 0)} · الربح {sar(q.profit ?? 0)} ({q.marginPct}%). هذه الأرقام
            داخلية ولا تظهر للعميل.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!r.projectId && (
          <Button variant="secondary" onClick={() => setQuoting(true)}>
            {hasQuote ? "تعديل عرض السعر" : "تسعير الطلب"}
          </Button>
        )}
        {!r.projectId && <Button onClick={() => setConverting(true)}>تحويل إلى عميل ومشروع</Button>}
        {r.projectId && (
          <>
            <Link
              to="/projects/$id"
              params={{ id: r.projectId }}
              className="text-brand hover:underline"
            >
              فتح المشروع
            </Link>
            <Link
              to="/clients/$id"
              params={{ id: r.clientId }}
              className="text-brand hover:underline"
            >
              فتح العميل
            </Link>
          </>
        )}
      </div>
      {quoting && (
        <QuoteDialog
          r={r}
          products={products}
          onClose={() => setQuoting(false)}
          onDone={onChanged}
        />
      )}
      {converting && (
        <ConvertDialog r={r} onClose={() => setConverting(false)} onDone={onChanged} />
      )}
    </div>
  );
}

function QuoteDialog({
  r,
  products,
  onClose,
  onDone,
}: {
  r: ProductRequest;
  products: ProductListItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [productId, setProductId] = useState(r.productId || products[0]?.id || "");
  const [pkgId, setPkgId] = useState("");
  const [times, setTimes] = useState(1);
  const [error, setError] = useState("");
  const prod = useQuery({ ...productQuery(productId), enabled: !!productId });
  const p = prod.data;
  const chosen = pkgId || p?.content.packages[0]?.id || "";
  const scaled = p && {
    ...p.pricing,
    packages: p.pricing.packages.map((x) => ({
      ...x,
      qty: Object.fromEntries(Object.entries(x.qty).map(([k, n]) => [k, n * Math.max(0, times)])),
      fixedPrice: x.fixedPrice * Math.max(0, times),
    })),
  };
  const preview = scaled && chosen ? packageQuote(scaled as PricingIn, chosen, p.vatRate) : null;
  const save = useMutation({
    mutationFn: async () =>
      ok(
        await sendJson(`/api/product-requests/${r.id}/quote`, "PUT", {
          productId,
          packageId: chosen,
          times,
        }),
      ),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: () => setError("تعذّر حفظ العرض: أكمل تكاليف الباقة وكمياتها في المنتج أولاً."),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="تسعير الطلب" wide>
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="المنتج">
            <Select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setPkgId("");
              }}
            >
              {products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الباقة">
            <Select value={chosen} onChange={(e) => setPkgId(e.target.value)}>
              {(p?.content.packages ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="عدد المستفيدين / الدورات">
            <Input
              type="number"
              min={1}
              value={times}
              onChange={(e) => setTimes(Math.max(0, Number(e.target.value)))}
            />
          </Field>
        </div>
        {preview && p && <QuoteResult q={preview} lines={p.pricing.lines} />}
        <Button
          className="w-full"
          disabled={!preview || preview.status !== "ok" || save.isPending}
          onClick={() => save.mutate()}
        >
          حفظ العرض على الطلب
        </Button>
      </div>
    </Dialog>
  );
}

function ConvertDialog({
  r,
  onClose,
  onDone,
}: {
  r: ProductRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [similar, setSimilar] = useState<{ id: string; name: string; code: string } | null>(null);
  const [pick, setPick] = useState<"existing" | "new">("existing");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ clientId: string; projectId: string } | null>(null);
  const go = useMutation({
    mutationFn: async () =>
      ok<{ clientId: string; projectId: string }>(
        await sendJson(`/api/product-requests/${r.id}/convert`, "POST", {
          ...(similar && pick === "existing" ? { clientId: similar.id } : {}),
          ...(similar && pick === "new" ? { confirmSimilarName: true } : {}),
          ...(name.trim() ? { projectName: name.trim() } : {}),
        }),
      ),
    onSuccess: (x) => {
      setDone(x);
      onDone();
    },
    onError: (x) => {
      if (x instanceof ApiError && x.body.error === "similar_name")
        setSimilar(x.body.similar as { id: string; name: string; code: string });
      else setError("تعذّر التحويل");
    },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="تحويل إلى عميل ومشروع">
      {done ? (
        <div className="space-y-3 text-sm">
          <Notice tone="blue">تم إنشاء المشروع كمسودة، وسعره المتوقع من عرض السعر.</Notice>
          <div className="flex gap-4">
            <Link
              to="/projects/$id"
              params={{ id: done.projectId }}
              className="text-brand hover:underline"
            >
              فتح المشروع
            </Link>
            <Link
              to="/clients/$id"
              params={{ id: done.clientId }}
              className="text-brand hover:underline"
            >
              فتح العميل
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {error && <Notice>{error}</Notice>}
          <p>
            سيُنشأ عميل باسم <b>{r.entity || r.name}</b> (جمعية) مع جهة اتصال {r.name}، ومشروع بحالة
            «مسودة».
          </p>
          {similar && (
            <Notice tone="amber">
              يوجد عميل بنفس الاسم: {similar.name} ({similar.code}).
              <span className="mt-2 block space-y-1">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={pick === "existing"}
                    onChange={() => setPick("existing")}
                  />{" "}
                  ربط المشروع بهذا العميل
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={pick === "new"} onChange={() => setPick("new")} />{" "}
                  إنشاء عميل جديد رغم ذلك
                </label>
              </span>
            </Notice>
          )}
          <Field label="اسم المشروع (اختياري)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${r.productName || "طلب"} — ${r.entity || r.name}`}
            />
          </Field>
          <Button className="w-full" disabled={go.isPending} onClick={() => go.mutate()}>
            {similar ? "متابعة" : "تحويل"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
