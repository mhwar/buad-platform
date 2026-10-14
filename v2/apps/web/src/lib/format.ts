import { formatSar, type Halalas } from "@buad/domain";

export const money = (h: number) => formatSar(h as Halalas);
/** Riyal amounts from calculations (finCalc works in riyals). */
const sarFmt = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});
export const sar = (riyals: number) => sarFmt.format(Number.isFinite(riyals) ? riyals : 0);
export const pct = (v: number) => `${(Number.isFinite(v) ? v : 0).toFixed(1)}%`;

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
/** "2026-03-01" → "1 مارس 2026"; empty stays empty. Parsed as UTC so no day shifts. */
export const day = (iso: string) => (iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : "");
export const fromEpoch = (s: number | null) => (s ? dateFmt.format(new Date(s * 1000)) : "");
export const today = () => new Date().toISOString().slice(0, 10);

/** Error raised for any non-2xx API answer, carrying the server's body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? status));
  }
}

export async function ok<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const relFmt = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
/** Epoch seconds → «منذ 3 أيام», «أمس», «الآن». */
export const ago = (s: number | null, now = Date.now()) => {
  if (!s) return "";
  const diff = Math.round(s - now / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, sec] of steps)
    if (Math.abs(diff) >= sec) return relFmt.format(Math.round(diff / sec), unit);
  return "الآن";
};

/** Saudi mobile → WhatsApp number (9665…); "" when it does not look like a mobile. */
export const whatsapp = (phone: string) => {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = `966${d.slice(1)}`;
  else if (d.startsWith("5") && d.length === 9) d = `966${d}`;
  return /^9665\d{8}$/.test(d) ? d : "";
};

const compactFmt = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  notation: "compact",
  maximumFractionDigits: 1,
});
/** Halalas → «30 ألف ر.س» / «1.2 مليون ر.س», for tight spaces like cards. */
export const moneyShort = (h: number) => `${compactFmt.format(Math.round(h / 100))} ر.س`;
