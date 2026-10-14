import { fireEvent, screen, within } from "@testing-library/react";
import { Briefcase, Files, House, Landmark, Users } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp } from "../test-utils";
import { FilterBar, type FilterField } from "./FilterBar";
import { MobileTabBar } from "./MobileTabBar";
import { StepNav } from "./StepNav";

afterEach(() => vi.unstubAllGlobals());

const NAV = [
  { to: "/", label: "الرئيسية", icon: House, exact: true },
  { to: "/clients", label: "العملاء", icon: Users, exact: false },
  { to: "/projects", label: "المشاريع", icon: Briefcase, exact: false },
  { to: "/documents", label: "المستندات", icon: Files, exact: false },
  { to: "/finance", label: "المالية", icon: Landmark, exact: false },
];

describe("MobileTabBar", () => {
  it("shows the primary sections in the bar and everything else under «المزيد»", async () => {
    const onLogout = vi.fn();
    await renderWithApp(
      <MobileTabBar
        nav={NAV}
        primary={["/", "/clients", "/projects", "/finance"]}
        userName="سلطان"
        onLogout={onLogout}
      />,
    );
    const bar = screen.getByRole("navigation", { name: "التنقل الرئيسي" });
    expect(
      within(bar)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["الرئيسية", "العملاء", "المشاريع", "المالية"]);
    expect(within(bar).queryByText("المستندات")).toBeNull();
    expect(within(bar).getByRole("link", { name: "الرئيسية" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(within(bar).getByRole("button", { name: "المزيد" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("link", { name: "المستندات" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "الإعدادات" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: /حسابي/ })).toHaveTextContent("سلطان");
    fireEvent.click(within(sheet).getByRole("button", { name: "خروج" }));
    expect(onLogout).toHaveBeenCalled();
  });
});

function Harness({ initial }: { initial: Record<string, string> }) {
  const [v, setV] = useState(initial);
  const fields: FilterField[] = [
    {
      key: "client",
      label: "العميل",
      value: v.client ?? "",
      allLabel: "كل العملاء",
      options: [
        { value: "c1", label: "جسد" },
        { value: "c2", label: "النور" },
      ],
    },
    {
      key: "status",
      label: "الحالة",
      value: v.status ?? "",
      allLabel: "كل الحالات",
      options: [{ value: "active", label: "جارٍ" }],
    },
  ];
  return <FilterBar fields={fields} onChange={(k, x) => setV((p) => ({ ...p, [k]: x }))} />;
}

describe("FilterBar", () => {
  it("counts active filters, shows them as removable chips, and clears them", async () => {
    await renderWithApp(<Harness initial={{ client: "c1", status: "active" }} />);
    expect(screen.getByRole("button", { name: /تصفية/ })).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "إزالة العميل: جسد" }));
    expect(screen.getByRole("button", { name: /تصفية/ })).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: /إزالة العميل/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "مسح الكل" }));
    expect(screen.queryByRole("button", { name: /^إزالة/ })).toBeNull();
  });

  it("the sheet offers every choice as a radio and applies on tap", async () => {
    await renderWithApp(<Harness initial={{}} />);
    fireEvent.click(screen.getByRole("button", { name: /تصفية/ }));
    const sheet = await screen.findByRole("dialog");
    const clients = within(sheet).getByRole("radiogroup", { name: "العميل" });
    expect(
      within(clients)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["كل العملاء", "جسد", "النور"]);
    fireEvent.click(within(clients).getByRole("radio", { name: "النور" }));
    expect(within(clients).getByRole("radio", { name: "النور" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "عرض النتائج" }));
    expect(await screen.findByRole("button", { name: "إزالة العميل: النور" })).toBeInTheDocument();
  });

  it("wide screens keep the inline selects", async () => {
    await renderWithApp(<Harness initial={{ client: "c2" }} />);
    expect(screen.getByRole("combobox", { name: "العميل" })).toHaveValue("c2");
  });
});

describe("StepNav", () => {
  const steps: { key: "a" | "b" | "c"; label: string; badge?: number }[] = [
    { key: "a", label: "التعريف" },
    { key: "b", label: "الباقات" },
    { key: "c", label: "الأداء", badge: 2 },
  ];
  function Wrap() {
    const [k, setK] = useState<"a" | "b" | "c">("b");
    return <StepNav steps={steps} value={k} onChange={setK} />;
  }

  it("shows the step number, moves with prev/next and jumps from the list", async () => {
    await renderWithApp(<Wrap />);
    const nav = screen.getByRole("navigation", { name: "الخطوات" });
    expect(within(nav).getByText("الخطوة 2 من 3")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "التالي" }));
    expect(within(nav).getByText("الخطوة 3 من 3")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "التالي" })).toBeDisabled();
    fireEvent.click(within(nav).getByRole("button", { name: "السابق" }));
    fireEvent.click(within(nav).getByRole("button", { name: /الباقات/ }));
    const list = await screen.findByRole("dialog");
    expect(within(list).getByRole("button", { name: /الأداء/ })).toHaveTextContent("2");
    fireEvent.click(within(list).getByRole("button", { name: /التعريف/ }));
    expect(within(nav).getByText("الخطوة 1 من 3")).toBeInTheDocument();
  });
});
