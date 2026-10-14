import { describe, expect, it } from "vitest";
import { paginate } from "./Pages";

const b = (o: { breakBefore?: boolean; keepWithNext?: boolean; keepWithPrev?: boolean } = {}) => o;

describe("paginate (A4 page split)", () => {
  it("fills pages greedily", () => {
    expect(paginate([b(), b(), b(), b()], [40, 40, 40, 40], 100)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
  it("honours forced page breaks", () => {
    expect(paginate([b(), b({ breakBefore: true }), b()], [10, 10, 10], 100)).toEqual([
      [0],
      [1, 2],
    ]);
  });
  it("never ends a page with a clause title", () => {
    // title (20) + paragraph (50) do not fit after 60 → both move.
    expect(paginate([b(), b({ keepWithNext: true }), b()], [60, 20, 50], 100)).toEqual([
      [0],
      [1, 2],
    ]);
  });
  it("does not leave the signatures alone on a page", () => {
    expect(paginate([b(), b(), b({ keepWithPrev: true })], [50, 40, 30], 100)).toEqual([
      [0],
      [1, 2],
    ]);
  });
  it("keeps an oversized block on its own page instead of looping", () => {
    expect(paginate([b(), b(), b()], [10, 500, 10], 100)).toEqual([[0], [1], [2]]);
  });
  it("charges the repeated header on pages after the first", () => {
    expect(paginate([b(), b(), b(), b()], [50, 50, 50, 50], 100, 30)).toEqual([[0, 1], [2], [3]]);
  });
});
