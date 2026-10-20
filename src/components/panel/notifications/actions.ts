"use server";

import { getSeller } from "@/server/auth/session";
import { markAllNotificationsRead, markNotificationRead } from "@/server/notifications/events";

export async function markNotificationReadAction(eventId: string): Promise<void> {
  const seller = await getSeller();
  if (!seller || typeof eventId !== "string" || eventId.length > 128) return;
  markNotificationRead(seller.shop.external_business_id, eventId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const seller = await getSeller();
  if (!seller) return;
  markAllNotificationsRead(seller.shop.external_business_id);
}
