import { describe, expect, it } from "vitest";
import { add, allocate, fromRiyals, halalas, toRiyals } from "./money";

describe("money", () => {
  it("rejects non-integer halalas", () => {
    expect(() => halalas(1.5)).toThrow(RangeError);
  });

  it("converts riyals without float drift", () => {
    expect(fromRiyals(0.1 + 0.2)).toBe(30);
    expect(fromRiyals(1.005)).toBe(101);
    expect(fromRiyals(-2.5)).toBe(-250);
    expect(toRiyals(halalas(12345))).toBe(123.45);
  });

  it("adds exactly", () => {
    expect(add(halalas(10), halalas(20), halalas(5))).toBe(35);
  });

  it("allocates so parts always sum to the total", () => {
    const parts = allocate(halalas(10000), [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it("allocates by weight and handles zero weights", () => {
    expect(allocate(halalas(1000), [3, 0, 1])).toEqual([750, 0, 250]);
    expect(() => allocate(halalas(100), [0, 0])).toThrow(RangeError);
  });

  it("sums exactly for many random splits", () => {
    for (let n = 1; n < 200; n++) {
      const weights = Array.from({ length: (n % 7) + 1 }, (_, i) => ((n * (i + 3)) % 11) + 1);
      const total = halalas(n * 137);
      expect(allocate(total, weights).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
