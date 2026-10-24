"use server";

import { redirect } from "next/navigation";

import { destroySession, switchCurrentShop } from "./session";

/** «خروج» from any signed-in screen. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

/** The topbar shop switcher. The id is the browser's; `switchCurrentShop` accepts it only for a shop the user is in. */
export async function switchShopAction(shopId: unknown): Promise<{ ok: false; message: string }> {
  if (!(await switchCurrentShop(shopId))) return { ok: false, message: "به این فروشگاه دسترسی ندارید." };
  redirect("/panel");
}
