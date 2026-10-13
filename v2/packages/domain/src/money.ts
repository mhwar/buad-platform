/**
 * Money is always an integer number of halalas (1 SAR = 100 halalas).
 * Floating-point riyals never cross a module boundary; this removes a whole
 * class of rounding drift that the v1 platform handled ad hoc.
 */
export type Halalas = number & { readonly __brand: "Halalas" };

export const halalas = (n: number): Halalas => {
  if (!Number.isInteger(n)) throw new RangeError(`halalas must be an integer, got ${n}`);
  return n as Halalas;
};

/** Convert riyals (possibly fractional, e.g. user input) to halalas, rounding half away from zero. */
export const fromRiyals = (riyals: number): Halalas => {
  if (!Number.isFinite(riyals)) throw new RangeError("riyals must be finite");
  const scaled = Math.abs(riyals) * 100;
  const rounded = Math.round(Number(scaled.toPrecision(15)));
  return halalas(riyals < 0 ? -rounded : rounded);
};

export const toRiyals = (h: Halalas): number => h / 100;

export const add = (...xs: Halalas[]): Halalas => halalas(xs.reduce((a, b) => a + b, 0));

/**
 * Split an amount across weights so that the parts always sum exactly to the
 * total (largest-remainder method). Used for distributions and installments.
 */
export const allocate = (total: Halalas, weights: number[]): Halalas[] => {
  if (weights.length === 0) throw new RangeError("weights must not be empty");
  if (weights.some((w) => !(w >= 0))) throw new RangeError("weights must be non-negative");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError("weights must not all be zero");
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder--;
  }
  return floors.map(halalas);
};

// Latin digits, matching dates and the rest of the UI.
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR" });
export const formatSar = (h: Halalas): string => nf.format(toRiyals(h));
