import { type PricingIn, packageQuote, priceQuote, type Quote } from "@buad/domain";
import type { PricingModel, ProductPackage } from "@buad/schema/products";
import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "../../components/ui";
import { pct, sar } from "../../lib/format";
import { Repeater, uid } from "./editors";
import { METHOD_LABEL, UNIT_LABEL } from "./products-api";

type Props = {
  pricing: PricingModel;
  packages: ProductPackage[];
  vatRate: number;
  onChange: (p: PricingModel) => void;
};

const num = (s: string) => (s === "" ? 0 : Number(s));

/**
 * «التكلفة والتسعير»: cost lines, how the price is derived, and each package's typical
 * quantities. Nothing is invented: a line with no cost keeps the package «needs costs».
 */
export function PricingPanel({ pricing, packages, vatRate, onChange }: Props) {
  const set = (patch: Partial<PricingModel>) => onChange({ ...pricing, ...patch });
  const pkgState = (id: string) =>
    pricing.packages.find((p) => p.packageId === id) ?? { packageId: id, qty: {}, fixedPrice: 0 };
  const setPkg = (
    id: string,
    patch: Partial<{ qty: Record<string, number>; fixedPrice: number }>,
  ) => {
    const cur = pkgState(id);
    const next = { ...cur, ...patch };
    set({
      packages: [...pricing.packages.filter((p) => p.packageId !== id), next],
    });
  };

  return (
    <div className="space-y-8">
      <Notice tone="blue">
        هذه الأرقام للتخطيط الداخلي فقط: لا تظهر التكاليف ولا الهوامش في الموقع ولا لأي زائر. أدخل
        تكاليفك الفعلية ليحسب النظام السعر.
      </Notice>

      <section>
        <h3 className="mb-3 font-bold">1. بنود التكلفة</h3>
        <Repeater
          items={pricing.lines}
          onChange={(lines) => set({ lines })}
          max={30}
          addLabel="إضافة بند تكلفة"
          emptyText="أضف بنود التكلفة التي تتحملها لتقديم الخدمة (رحلة، ليلة إقامة، إدارة…)."
          make={() => ({ id: uid("l"), label: "", unit: "fixed" as const, cost: 0, note: "" })}
          render={(l, patch) => (
            <>
              <Field label="البند">
                <Input value={l.label} onChange={(e) => patch({ label: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="وحدة القياس">
                  <Select
                    value={l.unit}
                    onChange={(e) => patch({ unit: e.target.value as typeof l.unit })}
                  >
                    {Object.entries(UNIT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="تكلفة الوحدة (ر.س)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={l.cost || ""}
                    placeholder="0"
                    onChange={(e) => patch({ cost: num(e.target.value) })}
                  />
                </Field>
              </div>
            </>
          )}
        />
      </section>

      <section>
        <h3 className="mb-3 font-bold">2. كيف يُحسب السعر</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الطريقة">
            <Select
              value={pricing.method}
              onChange={(e) => set({ method: e.target.value as PricingModel["method"] })}
            >
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {pricing.method !== "fixed" && (
            <Field label={pricing.method === "margin" ? "هامش الربح %" : "نسبة الإضافة %"}>
              <Input
                type="number"
                min={0}
                max={pricing.method === "margin" ? 99 : 1000}
                step="0.5"
                value={pricing.value || ""}
                placeholder="0"
                onChange={(e) => set({ value: num(e.target.value) })}
              />
            </Field>
          )}
          <div className="text-sm">
            <p className="mb-1 font-medium">ضريبة القيمة المضافة</p>
            <p className="rounded-lg border bg-canvas/40 px-3 py-2.5">
              {vatRate}% ·{" "}
              <Link to="/finance" search={{ tab: "vat" }} className="text-brand hover:underline">
                من «المالية ← الضريبة»
              </Link>
            </p>
          </div>
        </div>
        {pricing.method !== "fixed" && !pricing.value && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            حدّد {pricing.method === "margin" ? "هامش الربح" : "نسبة الإضافة"}، وإلا فسيساوي السعر
            التكلفة تماماً.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-1 font-bold">3. كميات كل باقة وسعرها</h3>
        <p className="mb-3 text-sm text-muted">
          اكتب الكميات المعتادة لكل مستفيد أو دورة في الباقة (مثلاً عدد الرحلات وليالي الإقامة).
        </p>
        {packages.length === 0 ? (
          <p className="text-sm text-muted">أضف باقة أولاً من خطوة «الباقات».</p>
        ) : pricing.lines.length === 0 ? (
          <p className="text-sm text-muted">أضف بنود التكلفة أولاً.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {packages.map((p) => {
              const st = pkgState(p.id);
              const q = packageQuote(pricing as PricingIn, p.id, vatRate);
              return (
                <Card key={p.id} className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h4 className="font-semibold">{p.name}</h4>
                    {p.highlight && <Badge tone="blue">الأكثر شمولاً</Badge>}
                  </div>
                  <div className="space-y-2">
                    {pricing.lines.map((l) => (
                      <label key={l.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {l.label || "بند"}{" "}
                          <span className="text-xs text-muted">({UNIT_LABEL[l.unit]})</span>
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          className="w-24"
                          aria-label={`${p.name}: ${l.label}`}
                          value={st.qty[l.id] || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setPkg(p.id, { qty: { ...st.qty, [l.id]: num(e.target.value) } })
                          }
                        />
                      </label>
                    ))}
                    {pricing.method === "fixed" && (
                      <Field label="السعر الثابت قبل الضريبة (ر.س)">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={st.fixedPrice || ""}
                          onChange={(e) => setPkg(p.id, { fixedPrice: num(e.target.value) })}
                        />
                      </Field>
                    )}
                  </div>
                  <QuoteResult q={q} lines={pricing.lines} />
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Calculator pricing={pricing} packages={packages} vatRate={vatRate} />
    </div>
  );
}

/** The result of a quote: either what is missing, or cost → price → profit. */
export function QuoteResult({ q, lines }: { q: Quote; lines: PricingModel["lines"] }) {
  if (q.status === "empty")
    return <p className="mt-3 text-sm text-muted">أدخل كميات لحساب السعر.</p>;
  if (q.status === "needs_costs")
    return (
      <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
        يحتاج إدخال تكلفة:{" "}
        {q.missing.map((id) => lines.find((l) => l.id === id)?.label || "بند").join("، ")}
      </p>
    );
  if (q.status === "needs_price")
    return <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">أدخل السعر الثابت.</p>;
  if (q.status === "invalid")
    return <p className="mt-3 text-sm text-red-600">هامش الربح يجب أن يكون أقل من 100%.</p>;
  const risk = q.marginIfCostUp10 < 0;
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
      <Row label="التكلفة" value={sar(q.cost)} />
      <Row label="السعر قبل الضريبة" value={sar(q.price)} strong />
      <Row label="الضريبة" value={sar(q.vat)} />
      <Row label="الإجمالي" value={sar(q.total)} />
      <Row label="الربح" value={sar(q.profit)} />
      <Row label="الهامش" value={`${pct(q.marginPct)}`} />
      <div className="col-span-2 text-xs text-muted">
        لو ارتفعت التكاليف 10% بنفس السعر يصبح الهامش{" "}
        <b className={risk ? "text-red-600" : ""}>{pct(q.marginIfCostUp10)}</b>
      </div>
    </dl>
  );
}
const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div>
    <dt className="text-xs text-muted">{label}</dt>
    <dd className={strong ? "font-bold" : ""}>{value}</dd>
  </div>
);

/** «حاسبة عرض»: pick a package, scale it by the number of beneficiaries, see the offer. */
function Calculator({ pricing, packages, vatRate }: Omit<Props, "onChange">) {
  const [pkgId, setPkgId] = useState(
    () =>
      packages.find((p) =>
        Object.values(pricing.packages.find((x) => x.packageId === p.id)?.qty ?? {}).some(
          (n) => n > 0,
        ),
      )?.id ??
      packages[0]?.id ??
      "",
  );
  const [times, setTimes] = useState(1);
  const [copied, setCopied] = useState(false);
  const st = pricing.packages.find((p) => p.packageId === pkgId);
  const qty = Object.fromEntries(
    Object.entries(st?.qty ?? {}).map(([k, v]) => [k, v * Math.max(0, times)]),
  );
  const fixed = (st?.fixedPrice ?? 0) * Math.max(0, times);
  const q = priceQuote(pricing as PricingIn, qty, fixed, vatRate);
  const pkg = packages.find((p) => p.id === pkgId);

  const summary = () =>
    [
      `عرض: ${pkg?.name ?? ""}`,
      `الكمية: ${times}`,
      ...q.lines.map((l) => `- ${l.label}: ${l.qty} × ${sar(l.unitCost)} = ${sar(l.amount)}`),
      `السعر قبل الضريبة: ${sar(q.price)}`,
      `الضريبة (${vatRate}%): ${sar(q.vat)}`,
      `الإجمالي: ${sar(q.total)}`,
    ].join("\n");

  return (
    <section>
      <h3 className="mb-1 font-bold">4. حاسبة العرض</h3>
      <p className="mb-3 text-sm text-muted">
        اختر باقة واضربها في عدد المستفيدين أو الدورات لتعرف السعر والربح قبل أن ترسل العرض.
      </p>
      {packages.length === 0 ? (
        <p className="text-sm text-muted">أضف باقة أولاً.</p>
      ) : (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الباقة">
              <Select value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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
          {q.status === "ok" && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-muted">
                  <tr>
                    <th className="py-1 text-start">البند</th>
                    <th className="py-1 text-start">الكمية</th>
                    <th className="py-1 text-start">تكلفة الوحدة</th>
                    <th className="py-1 text-start">التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1.5">{l.label}</td>
                      <td>{l.qty}</td>
                      <td>{sar(l.unitCost)}</td>
                      <td>{sar(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <QuoteResult q={q} lines={pricing.lines} />
          {q.status === "ok" && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={async () => {
                await navigator.clipboard?.writeText(summary()).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="size-4" /> {copied ? "تم النسخ" : "نسخ ملخص العرض"}
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}
