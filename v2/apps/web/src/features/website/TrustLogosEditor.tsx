import type { SiteContent } from "@buad/schema/site";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, Input, Notice, Select } from "../../components/ui";
import { clientsQuery } from "../clients/api";
import { uploadImage } from "../org/OrgSettings";
import { Repeater } from "../products/editors";

type Item = SiteContent["trust"]["items"][number];

/**
 * Entities we worked with, each with a name and an optional logo: uploaded, or copied from the
 * logo already stored on the matching client in the platform.
 */
export function TrustLogosEditor({
  items,
  onChange,
}: {
  items: Item[];
  onChange: (v: Item[]) => void;
}) {
  const clients = useQuery(clientsQuery({}));
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const withLogo = (clients.data?.items ?? []).filter((c) => c.logoUrl);

  const setLogo = async (i: number, get: () => Promise<File | Blob>) => {
    setBusy(i);
    setError("");
    try {
      const blob = await get();
      const file = blob instanceof File ? blob : new File([blob], "logo", { type: blob.type });
      const a = await uploadImage(file);
      onChange(items.map((x, k) => (k === i ? { ...x, logoAsset: a.id } : x)));
    } catch {
      setError("تعذّر رفع الشعار (PNG أو JPG أو WEBP أو SVG حتى 2 ميجابايت)");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {error && <Notice>{error}</Notice>}
      <p className="text-xs text-muted">
        اعرض فقط شعارات جهات وافقت على ذكرها. من لا شعار له يظهر اسمه في بطاقة.
      </p>
      <Repeater
        items={items}
        max={16}
        addLabel="إضافة جهة"
        onChange={onChange}
        make={() => ({ name: "", logoAsset: "" })}
        render={(it, set, i) => (
          <>
            <Field label="اسم الجهة">
              <Input value={it.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <div className="text-sm">
              <p className="mb-1 font-medium">الشعار</p>
              <div className="flex flex-wrap items-center gap-2">
                {it.logoAsset ? (
                  <img
                    src={`/api/assets/${it.logoAsset}`}
                    alt={it.name}
                    className="h-10 w-16 rounded border bg-white object-contain p-1"
                  />
                ) : (
                  <span className="text-xs text-muted">بلا شعار</span>
                )}
                <label className="cursor-pointer rounded-lg border px-3 py-1.5 hover:bg-brand-soft">
                  {busy === i ? "جارٍ الرفع…" : "رفع"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setLogo(i, async () => f);
                    }}
                  />
                </label>
                {it.logoAsset && (
                  <Button variant="ghost" onClick={() => set({ logoAsset: "" })}>
                    إزالة
                  </Button>
                )}
              </div>
            </div>
            {withLogo.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="أو انسخ شعار عميل من المنصة">
                  <Select
                    value=""
                    onChange={(e) => {
                      const c = withLogo.find((x) => x.id === e.target.value);
                      if (!c) return;
                      if (!it.name) set({ name: c.name });
                      setLogo(i, async () => {
                        const r = await fetch(c.logoUrl);
                        if (!r.ok) throw new Error("logo");
                        return r.blob();
                      });
                    }}
                  >
                    <option value="">اختر عميلاً…</option>
                    {withLogo.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}
