import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Placeholder for the notification bell in the panel topbar. The inbox owner replaces the body (webhook events,
 * unread count); keep the 44px target and the Farsi label.
 */
export function NotificationBellSlot({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="اعلان‌ها"
      className={cn(
        "relative flex size-11 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors duration-(--motion) ease-motion hover:bg-secondary hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Bell className="size-5" strokeWidth={1.5} />
    </button>
  );
}
