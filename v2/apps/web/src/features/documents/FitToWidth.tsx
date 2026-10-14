import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

const A4_PX = 794; // 210mm at 96dpi

/**
 * Shows an A4 sheet scaled down to the width available (like a document app's "fit width"),
 * so the whole page is visible on any screen. Printing is unaffected (no scaling in print).
 */
export function FitToWidth({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const s = Math.min(1, o.clientWidth / A4_PX);
      setScale(s);
      setHeight(i.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="doc-fit" style={{ height }}>
      <div
        ref={inner}
        className="doc-fit-inner"
        style={{ transform: `scale(${scale})`, width: A4_PX }}
      >
        {children}
      </div>
    </div>
  );
}
