import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithApp } from "./test-utils";
import { AppearanceCard } from "./theme";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("AppearanceCard", () => {
  it("offers light, dark and follow-the-device, and applies and saves the choice", async () => {
    await renderWithApp(<AppearanceCard />);
    const group = screen.getByRole("radiogroup");
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /حسب الجهاز/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: /ليلي/ }));
    expect(screen.getByRole("radio", { name: /ليلي/ })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("buad-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: /نهاري/ }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
