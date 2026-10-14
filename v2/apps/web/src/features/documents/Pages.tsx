import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** One unbreakable piece of a document (a heading, a paragraph, the signatures…). */
export type Block = {
  key: string;
  node: ReactNode;
  className?: string;
  /** Start a new page here («فاصل صفحة»). */
  breakBefore?: boolean;
  /** Never end a page with this block (clause titles). */
  keepWithNext?: boolean;
  /** Never start a page alone with this block (signatures): the previous block comes along. */
  keepWithPrev?: boolean;
};

/**
 * Greedy A4 pagination over measured block heights (pure, so it is unit-tested).
 * `avail` is the body height of one page; `repeat` is taken on every page (e.g. a table header).
 */
export function paginate(
  blocks: Pick<Block, "breakBefore" | "keepWithNext" | "keepWithPrev">[],
  heights: number[],
  avail: number,
  /** Height repeated at the top of every page after the first. */
  repeat = 0,
): number[][] {
  const pages: number[][] = [[]];
  const used = [0];
  const cur = () => pages.length - 1;
  const newPage = () => {
    pages.push([]);
    used.push(repeat);
  };
  blocks.forEach((b, i) => {
    const h = heights[i] ?? 0;
    const next = b.keepWithNext ? (heights[i + 1] ?? 0) : 0;
    const page = pages[cur()] ?? [];
    if (page.length && (b.breakBefore || (used[cur()] ?? 0) + h + next > avail)) newPage();
    pages[cur()]?.push(i);
    used[cur()] = (used[cur()] ?? 0) + h;
  });
  // A page that starts with a keep-with-previous block takes the previous page's last block,
  // when it fits and does not empty that page.
  for (let p = 1; p < pages.length; p++) {
    const page = pages[p] ?? [];
    const prev = pages[p - 1] ?? [];
    const first = page[0];
    if (first === undefined || !blocks[first]?.keepWithPrev || prev.length < 2) continue;
    if (blocks[first]?.breakBefore) continue;
    const moved = prev[prev.length - 1] as number;
    const h = heights[moved] ?? 0;
    if ((used[p] ?? 0) + h > avail) continue;
    prev.pop();
    page.unshift(moved);
    used[p] = (used[p] ?? 0) + h;
    used[p - 1] = (used[p - 1] ?? 0) - h;
  }
  return pages.filter((pg, i) => pg.length || i === 0);
}

const same = (a: number[][], b: number[][]) =>
  a.length === b.length && a.every((p, i) => p.join() === b[i]?.join());

/**
 * A document as real A4 pages (210×297mm): every page carries the letterhead header and footer,
 * the body is split by measuring each block, and print/PDF get exactly these pages.
 */
export function PagedSheets({
  title,
  style,
  watermark,
  header,
  footer,
  footerLabel,
  blocks,
  repeat,
  onReady,
}: {
  title: string;
  style?: CSSProperties;
  watermark?: string;
  header?: string;
  footer?: string;
  footerLabel?: string;
  blocks: Block[];
  /** Shown at the top of every page's body after the first (e.g. a table header). */
  repeat?: ReactNode;
  /** Called once pages are measured, images loaded and fonts ready (used by PDF export). */
  onReady?: (root: HTMLElement) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>(() => [blocks.map((_, i) => i)]);
  const [, setTick] = useState(0);
  const rerun = useCallback(() => setTick((t) => t + 1), []);
  const readyFor = useRef("");

  // Re-measure after every render (cheap), committing only when the split changes.
  useLayoutEffect(() => {
    const r = root.current;
    const m = measure.current;
    const page = r?.querySelector<HTMLElement>(".doc-page");
    if (!r || !m || !page) return;
    const head = page.querySelector<HTMLElement>(".doc-page-header");
    const foot = page.querySelector<HTMLElement>(".doc-page-footer");
    const body = page.querySelector<HTMLElement>(".doc-body");
    const pad = body
      ? Number.parseFloat(getComputedStyle(body).paddingTop) +
        Number.parseFloat(getComputedStyle(body).paddingBottom)
      : 0;
    const avail =
      page.offsetHeight - ((head?.offsetHeight ?? 0) + (foot?.offsetHeight ?? 0) + pad) - 1;
    const els = m.querySelectorAll<HTMLElement>(":scope > .doc-body > [data-block]");
    const heights = Array.from(els, (e) => e.offsetHeight);
    const rep = m.querySelector<HTMLElement>("[data-repeat]")?.offsetHeight ?? 0;
    const next = paginate(blocks, heights, avail, rep);
    if (!same(next, pages)) {
      r.removeAttribute("data-ready");
      setPages(next);
    } else {
      // Stable split + images loaded + fonts ready = final pages. `data-ready` tells the PDF
      // renderer (and tests) that the pages can be printed now.
      const imgs = Array.from(r.querySelectorAll("img"));
      const sig = `${next.map((p) => p.join()).join("|")}#${blocks.length}`;
      if (imgs.every((i) => i.complete) && readyFor.current !== sig) {
        readyFor.current = sig;
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        (fonts?.ready ?? Promise.resolve()).then(() => {
          r.setAttribute("data-ready", "");
          onReady?.(r);
        });
      }
    }
  });

  // Images (letterhead, stamp) and web fonts change heights once loaded.
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    r.addEventListener("load", rerun, true);
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(rerun);
    return () => r.removeEventListener("load", rerun, true);
  }, [rerun]);

  const total = pages.length;
  return (
    <div ref={root} className="doc-pages" style={style} dir="rtl" aria-label={title}>
      {pages.map((idx, n) => (
        <article
          // biome-ignore lint/suspicious/noArrayIndexKey: pages are positional
          key={n}
          className="doc-sheet doc-page"
          aria-label={`صفحة ${n + 1} من ${total}`}
        >
          {watermark && <div className="doc-watermark-approved">{watermark}</div>}
          <div className="doc-page-header">
            {header ? (
              <img src={header} alt="" className="doc-band" />
            ) : (
              <div className="doc-band-space" />
            )}
          </div>
          <div className="doc-body">
            {repeat && n > 0 && <div className="doc-block">{repeat}</div>}
            {idx.map((i) => {
              const b = blocks[i];
              return b ? (
                <div key={b.key} className={`doc-block ${b.className ?? ""}`}>
                  {b.node}
                </div>
              ) : null;
            })}
          </div>
          <div className="doc-page-footer">
            {footer || footerLabel ? (
              <div className="doc-footer">
                {footer && <img src={footer} alt="" className="doc-band" />}
                {footerLabel && <span className="doc-footer-label">{footerLabel}</span>}
              </div>
            ) : (
              <div className="doc-band-space" />
            )}
          </div>
          {total > 1 && (
            <span className="doc-page-no">
              {n + 1} / {total}
            </span>
          )}
        </article>
      ))}
      {/* Off-screen copy of every block at page width: the source of the heights above. */}
      <div ref={measure} className="doc-measure" aria-hidden>
        <div className="doc-body">
          {repeat && (
            <div className="doc-block" data-repeat>
              {repeat}
            </div>
          )}
          {blocks.map((b) => (
            <div key={b.key} data-block className={`doc-block ${b.className ?? ""}`}>
              {b.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
