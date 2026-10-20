"use server";

import { redirect } from "next/navigation";

import { destroySession } from "./session";

/** «خروج» from any signed-in screen. */
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
