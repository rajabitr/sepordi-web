"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/model/result";
import type { AdminSettings } from "@/components/admin/model/settings";
import { requireAdmin } from "@/server/auth/session";
import { saveAdminSettings } from "@/server/admin/settings";

export async function saveSettingsAction(input: AdminSettings): Promise<ActionResult<AdminSettings>> {
  await requireAdmin();
  const r = saveAdminSettings(input);
  if (!r.ok) return { ok: false, message: "چند مورد را باید درست کنید.", fields: r.errors };
  // The marketing pages and the seller panel read these keys.
  revalidatePath("/", "layout");
  return { ok: true, data: r.value };
}
