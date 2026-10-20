import "server-only";

import { connection } from "next/server";

import { settings } from "@/server/db/repo";

import { normalizePlans, normalizeSupport, type PlanSetting, type SupportSetting } from "./plans-model";

/*
 * Settings are edited by the sepordi admin at run time, so they are read per request (connection() keeps the read
 * out of the prerendered shell). A missing or unreadable database must not take the marketing site down with it:
 * it renders the «به‌زودی» / placeholder state instead.
 */

export async function readPlans(): Promise<PlanSetting[] | null> {
  await connection();
  try {
    return normalizePlans(settings.get<unknown>("plans"));
  } catch (err) {
    console.error("marketing: reading the plans setting failed", err);
    return null;
  }
}

export async function readSupport(): Promise<SupportSetting> {
  await connection();
  try {
    return normalizeSupport(settings.get<unknown>("support"));
  } catch (err) {
    console.error("marketing: reading the support setting failed", err);
    return normalizeSupport(null);
  }
}
