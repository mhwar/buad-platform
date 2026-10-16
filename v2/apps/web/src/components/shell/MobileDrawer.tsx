import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { Sidebar } from "./Sidebar";

/**
 * The phone's «المزيد»: the same sidebar as on a computer — account, «إنشاء جديد», every section
 * with its pages, the recent items and settings — sliding in from the right edge.
 */
export function MobileDrawer({
  open,
  onOpenChange,
  ...sidebar
}: { open: boolean; onOpenChange: (v: boolean) => void } & Omit<
  ComponentProps<typeof Sidebar>,
  "drawer"
>) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden" />
        <RDialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[86vw] max-w-sm flex-col border-s bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl lg:hidden"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <RDialog.Title className="font-bold">القائمة</RDialog.Title>
            <RDialog.Close
              className="grid size-10 place-items-center rounded-lg text-muted hover:text-ink"
              aria-label="إغلاق القائمة"
            >
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1">
            <Sidebar {...sidebar} drawer />
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
