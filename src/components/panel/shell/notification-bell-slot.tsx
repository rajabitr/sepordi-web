import { NotificationBell } from "@/components/panel/notifications/notification-bell";

/** The notification bell in the panel topbar (webhook events of the seller's shop, see components/panel/notifications). */
export function NotificationBellSlot({ className }: { className?: string }) {
  return <NotificationBell className={className} />;
}
