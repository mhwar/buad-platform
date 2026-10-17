import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Button, ConfirmHost, confirmAction, Dialog, DialogActions, ToastHost, toast } from "./ui";

describe("confirmAction", () => {
  it("asks in the platform's own dialog, names the action, and resolves with the answer", async () => {
    render(<ConfirmHost />);
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirmAction({
        title: "حذف المهمة؟",
        text: "لا يمكن التراجع.",
        action: "حذف المهمة",
        danger: true,
      });
    });
    const ask = await screen.findByRole("alertdialog");
    expect(ask).toHaveTextContent("حذف المهمة؟");
    expect(ask).toHaveTextContent("لا يمكن التراجع.");
    // the safe answer has the focus
    expect(screen.getByRole("button", { name: "إلغاء" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "حذف المهمة" }));
    await expect(answer).resolves.toBe(true);
  });

  it("resolves false on cancel", async () => {
    render(<ConfirmHost />);
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirmAction({ title: "أرشفة؟" });
    });
    await userEvent.click(await screen.findByRole("button", { name: "إلغاء" }));
    await expect(answer).resolves.toBe(false);
  });
});

describe("toast", () => {
  it("says it is done, then leaves", async () => {
    render(<ToastHost />);
    act(() => toast("سُجّل المقبوض"));
    expect(await screen.findByRole("status")).toHaveTextContent("سُجّل المقبوض");
  });
});

describe("Dialog footer", () => {
  it("keeps the main action, cancel and a set-apart delete in the footer", async () => {
    let cancelled = false;
    render(
      <Dialog
        open
        onOpenChange={() => {}}
        title="قيد"
        footer={
          <DialogActions
            onCancel={() => (cancelled = true)}
            aside={<Button variant="ghost">حذف</Button>}
          >
            <Button>حفظ</Button>
          </DialogActions>
        }
      >
        <input aria-label="البيان" />
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "حفظ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حذف" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(cancelled).toBe(true);
  });
});
