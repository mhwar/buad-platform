import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type DocDetail, waitingLabel } from "./api";
import { DocStepper } from "./DocStepper";

const NOW = Date.UTC(2026, 9, 16);
const sec = (daysAgo: number) => NOW / 1000 - daysAgo * 86400;

describe("waitingLabel", () => {
  it("counts the days in review, from when it got there", () => {
    const d = { status: "review", updatedAt: sec(0) };
    expect(waitingLabel({ ...d, statusChangedAt: sec(0) }, NOW)).toBe("بانتظار الاعتماد منذ اليوم");
    expect(waitingLabel({ ...d, statusChangedAt: sec(1) }, NOW)).toBe("بانتظار الاعتماد منذ يوم");
    expect(waitingLabel({ ...d, statusChangedAt: sec(2) }, NOW)).toBe("بانتظار الاعتماد منذ يومين");
    expect(waitingLabel({ ...d, statusChangedAt: sec(5) }, NOW)).toBe(
      "بانتظار الاعتماد منذ 5 أيام",
    );
    expect(waitingLabel({ ...d, statusChangedAt: sec(14) }, NOW)).toBe(
      "بانتظار الاعتماد منذ 14 يوماً",
    );
    // not kept yet (older documents): the last edit stands in
    expect(waitingLabel({ status: "review", statusChangedAt: 0, updatedAt: sec(3) }, NOW)).toBe(
      "بانتظار الاعتماد منذ 3 أيام",
    );
    expect(waitingLabel({ status: "draft", updatedAt: sec(9) }, NOW)).toBe("");
  });
});

const doc = (o: Partial<DocDetail["document"]>) =>
  ({
    status: "draft",
    approvedAt: null,
    outgoingNo: "",
    outgoingAt: null,
    updatedAt: sec(0),
    statusChangedAt: 0,
    ...o,
  }) as DocDetail["document"];

describe("DocStepper", () => {
  it("marks the current step: review, then outgoing once it has a number", () => {
    const { rerender } = render(
      <DocStepper doc={doc({ status: "review", statusChangedAt: sec(0) })} />,
    );
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("مراجعة");
    rerender(
      <DocStepper
        doc={doc({ status: "approved", approvedAt: sec(1), outgoingNo: "ص-1", outgoingAt: sec(0) })}
      />,
    );
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("صادر");
  });
});
