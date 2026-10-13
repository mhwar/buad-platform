import { formatSar, type Halalas } from "@buad/domain";

export const money = (h: number) => formatSar(h as Halalas);

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
