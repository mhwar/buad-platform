import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "../../components/ui";
import { day, sar } from "../../lib/format";
import { PdfButton } from "../documents/PdfButton";
import { quoteQuery } from "./api";

/** `/print/quotes/:id`: the offer as the client receives it. Prices only; no costs or margins. */
export function QuotePrintPage({ id }: { id: string }) {
  const q = useQuery(quoteQuery(id));
  if (!q.data)
    return <div className="m-6 h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />;
  const { quote: z, org } = q.data;
  const created = new Date(z.createdAt * 1000).toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/sales" className="text-sm text-muted hover:text-ink">
          ← المبيعات
        </Link>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة
          </Button>
          <PdfButton path={`/print/quotes/${id}`} name={z.number} />
        </div>
      </div>
      <div
        className="print-root bg-slate-100 p-3 sm:p-4 dark:bg-slate-900 print:bg-transparent print:p-0"
        data-pdf-ready=""
      >
        <div className="doc-pages">
          <article
            className="quote-sheet mx-auto w-[210mm] max-w-full bg-white p-[16mm] text-[11.5pt] leading-[1.8] text-gray-900 shadow print:shadow-none"
            style={{ minHeight: "297mm" }}
          >
            <header className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
              <div>
                <p className="text-xl font-bold">{org.name}</p>
                {org.tax && <p className="text-xs text-gray-600">الرقم الضريبي: {org.tax}</p>}
                {org.address && <p className="text-xs text-gray-600">{org.address}</p>}
                {(org.phone || org.email) && (
                  <p dir="ltr" className="text-start text-xs text-gray-600">
                    {[org.phone, org.email].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              {org.urls?.logoAsset && (
                <img src={org.urls.logoAsset} alt="" className="h-16 w-auto object-contain" />
              )}
            </header>
            <h1 className="my-5 text-center text-2xl font-bold">عرض سعر</h1>
            <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-gray-500">الرقم: </dt>
                <dd className="inline font-semibold">{z.number}</dd>
              </div>
              <div>
                <dt className="inline text-gray-500">التاريخ: </dt>
                <dd className="inline">{day(created)}</dd>
              </div>
              <div>
                <dt className="inline text-gray-500">إلى: </dt>
                <dd className="inline font-semibold">
                  {[z.recipient, z.entity].filter(Boolean).join(" — ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-gray-500">صالح حتى: </dt>
                <dd className="inline">{z.validUntil ? day(z.validUntil) : "—"}</dd>
              </div>
            </dl>
            <p className="mb-3 font-semibold">{z.title}</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-start">
                  <th className="border p-2 text-start">البند</th>
                  <th className="border p-2 text-center">الكمية</th>
                  <th className="border p-2 text-end">السعر</th>
                  <th className="border p-2 text-end">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {z.items.map((i, k) => (
                  <tr key={k}>
                    <td className="border p-2">{i.label}</td>
                    <td className="border p-2 text-center tabular-nums">{i.qty}</td>
                    <td className="border p-2 text-end tabular-nums">{sar(i.unit)}</td>
                    <td className="border p-2 text-end tabular-nums">{sar(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="mt-3 ms-auto w-72 text-sm">
              <tbody>
                <tr>
                  <td className="py-0.5">المجموع</td>
                  <td className="text-end tabular-nums">{sar(z.totals.subtotal)}</td>
                </tr>
                {z.totals.discount > 0 && (
                  <tr>
                    <td className="py-0.5">الخصم</td>
                    <td className="text-end tabular-nums">− {sar(z.totals.discount)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-0.5">ضريبة القيمة المضافة ({z.vatPct}%)</td>
                  <td className="text-end tabular-nums">{sar(z.totals.vat)}</td>
                </tr>
                <tr className="border-t-2 border-gray-800 text-base font-bold">
                  <td className="pt-1">الإجمالي</td>
                  <td className="pt-1 text-end tabular-nums">{sar(z.totals.total)}</td>
                </tr>
              </tbody>
            </table>
            {z.terms && (
              <section className="mt-6">
                <h2 className="mb-1 font-semibold">الشروط والملاحظات</h2>
                <p className="whitespace-pre-line text-sm">{z.terms}</p>
              </section>
            )}
            {org.bankIban && (
              <section className="mt-6 rounded border border-gray-300 p-3 text-sm">
                <h2 className="mb-1 font-semibold">بيانات التحويل البنكي</h2>
                <p>
                  {org.name}
                  {org.bankName && ` · ${org.bankName}`}
                </p>
                <p dir="ltr" className="text-end font-mono tracking-wide">
                  {org.bankIban}
                </p>
              </section>
            )}
            {(org.signerName || org.signerTitle) && (
              <footer className="mt-10 text-sm">
                <p className="font-semibold">{org.signerName}</p>
                <p className="text-gray-600">{org.signerTitle}</p>
              </footer>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
