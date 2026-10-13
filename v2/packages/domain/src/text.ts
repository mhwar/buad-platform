/**
 * Normalises an Arabic/Latin name for duplicate detection: case, diacritics (tashkeel),
 * tatweel, alef/yaa/taa-marbuta variants and spacing are folded so that
 * «مؤسسة  الأمَل» and «مؤسسه الامل» compare equal.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel, superscript alef, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Zero-padded sequential code: code("CL", 7) → "CL-0007"; with a year: "PRJ-2026-0007". */
export function formatCode(prefix: string, n: number, year?: number): string {
  const seq = String(n).padStart(4, "0");
  return year ? `${prefix}-${year}-${seq}` : `${prefix}-${seq}`;
}
