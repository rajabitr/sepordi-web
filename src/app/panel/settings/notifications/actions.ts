"use server";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireSeller } from "@/server/auth/session";
import { NOTIFY_FAMILIES, setNotifyPrefs, type NotifyFamily } from "@/server/notifications/prefs";

export async function saveNotifyPrefsAction(muted: unknown): Promise<ActionResult<{ muted: NotifyFamily[] }>> {
  const { user, shop } = await requireSeller();
  if (!Array.isArray(muted) || muted.length > NOTIFY_FAMILIES.length) return { ok: false, message: "تنظیم اعلان‌ها درست نیست؛ صفحه را دوباره باز کنید." };
  return { ok: true, data: setNotifyPrefs(user.id, shop.id, muted) };
}
