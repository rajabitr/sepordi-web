"use server";

import { revalidatePath } from "next/cache";

import { CONDITIONS_MAX, PERSONA_MAX, PROFILE_MAX, WINDOW_MAX } from "@/components/panel/assistant/limits";
import type { ActionResult } from "@/components/panel/overview/action-result";
import { actionError } from "@/components/panel/overview/settle";
import { requireSeller } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

export interface AssistantInput {
  enabled: boolean;
  auto_reply: boolean;
  reply_language: "fa" | "en" | "ar";
  persona_name: string;
  business_profile: string;
}

const LANGS = ["fa", "en", "ar"] as const;

export async function saveAssistantAction(input: AssistantInput): Promise<ActionResult<AssistantInput>> {
  const { shop } = await requireSeller();
  const persona = String(input.persona_name ?? "").trim();
  const profile = String(input.business_profile ?? "").trim();
  if (!LANGS.includes(input.reply_language)) return { ok: false, field: "reply_language", message: "زبان پاسخ را انتخاب کنید." };
  if ([...persona].length > PERSONA_MAX) return { ok: false, field: "persona_name", message: "نام دستیار حداکثر ۸۰ نویسه است." };
  if ([...profile].length > PROFILE_MAX) return { ok: false, field: "business_profile", message: "معرفی فروشگاه حداکثر ۴٬۰۰۰ نویسه است." };
  try {
    const a = await bizin.updateAssistant(shop.external_business_id, {
      enabled: Boolean(input.enabled),
      auto_reply: Boolean(input.auto_reply),
      reply_language: input.reply_language,
      persona_name: persona,
      business_profile: profile,
    });
    revalidatePath("/panel");
    return {
      ok: true,
      data: {
        enabled: a.enabled,
        auto_reply: a.auto_reply,
        reply_language: a.reply_language,
        persona_name: a.persona_name,
        business_profile: a.business_profile,
      },
    };
  } catch (e) {
    return actionError(e);
  }
}

export interface ReturnPolicyInput {
  enabled: boolean;
  window_days: number | null;
  conditions: string;
}

export async function saveReturnPolicyAction(input: ReturnPolicyInput): Promise<ActionResult<ReturnPolicyInput>> {
  const { shop } = await requireSeller();
  const conditions = String(input.conditions ?? "").trim();
  const days = input.window_days;
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > WINDOW_MAX)) {
    return { ok: false, field: "window_days", message: "مهلت مرجوعی باید عددی بین ۰ تا ۳۶۵ روز باشد." };
  }
  if ([...conditions].length > CONDITIONS_MAX) return { ok: false, field: "conditions", message: "شرایط مرجوعی حداکثر ۱٬۵۰۰ نویسه است." };
  if (input.enabled && days === null && !conditions) {
    return { ok: false, field: "conditions", message: "برای قانون مرجوعی فعال، مهلت یا شرایط را بنویسید." };
  }
  try {
    const p = await bizin.putReturnPolicy(shop.external_business_id, { enabled: Boolean(input.enabled), window_days: days, conditions });
    return { ok: true, data: { enabled: p.enabled, window_days: p.window_days, conditions: p.conditions } };
  } catch (e) {
    return actionError(e);
  }
}
