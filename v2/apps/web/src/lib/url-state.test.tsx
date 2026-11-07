import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithApp } from "../test-utils";
import { useSearchParam } from "./url-state";

function Tabs() {
  const [tab, setTab] = useSearchParam<"a" | "b">("tab", "a");
  return (
    <button type="button" onClick={() => setTab(tab === "a" ? "b" : "a")}>
      {tab}
    </button>
  );
}

describe("useSearchParam", () => {
  it("keeps the value in the address and leaves the default out", async () => {
    const { router } = await renderWithApp(<Tabs />);
    expect(screen.getByRole("button")).toHaveTextContent("a");
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("b");
    expect(router.state.location.search).toMatchObject({ tab: "b" });
    await userEvent.click(screen.getByRole("button"));
    expect(router.state.location.search).not.toHaveProperty("tab");
  });

  it("reads a value already in the address, typed or numeric", async () => {
    const { router } = await renderWithApp(<Tabs />);
    await act(() => router.navigate({ to: "/", search: { tab: "b" } } as never));
    expect(screen.getByRole("button")).toHaveTextContent("b");
  });
});
