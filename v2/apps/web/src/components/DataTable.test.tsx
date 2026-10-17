import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";

const rows = [
  { id: "a", name: "ملتقى", value: 100 },
  { id: "b", name: "أكاديمية", value: 300 },
  { id: "c", name: "حملة", value: 200 },
];

describe("DataTable", () => {
  it("sorts by a header and tells screen readers, numbers high-first", async () => {
    render(
      <DataTable
        caption="المشاريع"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            key: "name",
            header: "المشروع",
            primary: true,
            sort: (r) => r.name,
            cell: (r) => r.name,
          },
          {
            key: "value",
            header: "القيمة",
            numeric: true,
            sort: (r) => r.value,
            cell: (r) => String(r.value),
          },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "المشاريع" });
    const head = within(table).getByRole("columnheader", { name: /القيمة/ });
    expect(head).toHaveAttribute("aria-sort", "none");
    await userEvent.click(within(head).getByRole("button"));
    expect(head).toHaveAttribute("aria-sort", "descending");
    const cells = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]!.textContent);
    expect(cells).toEqual(["أكاديمية", "حملة", "ملتقى"]);
    // the phone cards list the same rows
    expect(screen.getByRole("list", { name: "المشاريع" }).querySelectorAll("li")).toHaveLength(3);
  });
});
