import { useState } from "react";
import { Button } from "../../components/ui";
import { uploadImage } from "../org/OrgSettings";

/** Upload or remove one image (a hero photo, a service cover); shows what is there now. */
export function ImagePicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (assetId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (file?: File) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return setError("الحد الأقصى 3MB");
    setBusy(true);
    setError("");
    try {
      onChange((await uploadImage(file)).id);
    } catch {
      setError("تعذّر رفع الصورة");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={`/api/assets/${value}`}
            alt=""
            className="h-24 w-40 rounded-lg border object-cover"
          />
        ) : (
          <span className="grid h-24 w-40 place-items-center rounded-lg border border-dashed text-xs text-muted">
            بلا صورة
          </span>
        )}
        <label className="cursor-pointer rounded-lg border px-3 py-2 hover:bg-brand-soft">
          {busy ? "جارٍ الرفع…" : value ? "تغيير الصورة" : "رفع صورة"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={label}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        {value && (
          <Button variant="ghost" onClick={() => onChange("")}>
            إزالة
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
