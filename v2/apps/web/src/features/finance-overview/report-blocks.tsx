import type { ReactNode } from "react";
import type { Block } from "../documents/Pages";

/** One table row as its own block; fixed column widths keep the rows of a section aligned. */
export function Row({
  widths,
  cells,
  head,
  total,
}: {
  widths: number[];
  cells: ReactNode[];
  head?: boolean;
  total?: boolean;
}) {
  return (
    <table className={`st-table ${head ? "" : "st-cont"} ${total ? "st-totals" : ""}`}>
      <colgroup>
        {widths.map((w, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
          <col key={i} style={{ width: `${w}%` }} />
        ))}
      </colgroup>
      {head ? (
        <thead>
          <tr>
            {cells.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
      ) : (
        <tbody>
          <tr>
            {cells.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
              <td key={i} className={i > 0 ? "st-num" : undefined}>
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      )}
    </table>
  );
}

export function section(
  key: string,
  title: string,
  widths: number[],
  head: string[],
  rows: ReactNode[][],
  total?: ReactNode[],
): Block[] {
  if (rows.length === 0)
    return [
      { key: `${key}-h`, keepWithNext: true, node: <h2 className="doc-clause-title">{title}</h2> },
      { key: `${key}-none`, node: <p className="st-note">لا بيانات في هذه الفترة.</p> },
    ];
  return [
    { key: `${key}-h`, keepWithNext: true, node: <h2 className="doc-clause-title">{title}</h2> },
    { key: `${key}-head`, keepWithNext: true, node: <Row widths={widths} cells={head} head /> },
    ...rows.map((cells, i) => ({
      key: `${key}-${i}`,
      node: <Row widths={widths} cells={cells} />,
    })),
    ...(total
      ? [
          {
            key: `${key}-total`,
            keepWithPrev: true,
            node: <Row widths={widths} cells={total} total />,
          },
        ]
      : []),
  ];
}
