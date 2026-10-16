import { describe, expect, it } from "vitest";
import { csvToRows } from "./export";

describe("csvToRows", () => {
  it("reads quoted cells, commas and quotes inside, blank lines, and numbers", () => {
    const csv =
      '﻿"المشروع","ملتقى, الشباب"\r\n\r\n"البند","قال ""نعم"""\r\n"المبلغ",1500.5\r\n-20,0';
    expect(csvToRows(csv)).toEqual([
      ["المشروع", "ملتقى, الشباب"],
      [""],
      ["البند", 'قال "نعم"'],
      ["المبلغ", 1500.5],
      [-20, 0],
    ]);
  });
});
