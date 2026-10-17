/** What a contract or letter prints about the organisation: empty, it prints «............». */
export const IDENTITY_FIELDS = [
  ["name", "اسم الجهة"],
  ["reg", "رقم السجل التجاري"],
  ["tax", "الرقم الضريبي"],
  ["signerName", "المفوض بالتوقيع"],
] as const;

/** Everything «بيانات الجهة» should hold, for the settings overview's «x من y». */
export const ORG_FIELDS = [
  ...IDENTITY_FIELDS,
  ["address", "العنوان"],
  ["phone", "الهاتف"],
  ["bankIban", "رقم الآيبان"],
  ["logoAsset", "الشعار"],
  ["stampAsset", "الختم"],
  ["signatureAsset", "التوقيع"],
] as const;

type Fields = readonly (readonly [string, string])[];

/** The labels of the fields left empty (all of them when the profile is not loaded). */
export function missingFields(profile: object | null | undefined, fields: Fields): string[] {
  const p = (profile ?? {}) as Record<string, unknown>;
  return fields.filter(([k]) => !String(p[k] ?? "").trim()).map(([, label]) => label);
}
