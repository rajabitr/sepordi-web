"use server";

import { revalidatePath } from "next/cache";

import { checkKnowledge, type KnowledgeDraft } from "@/components/panel/assistant/knowledge";
import { CONDITIONS_MAX, PERSONA_MAX, WINDOW_MAX } from "@/components/panel/assistant/limits";
import type { ActionResult } from "@/components/panel/overview/action-result";
import { actionError } from "@/components/panel/overview/settle";
import { requireShopOwner } from "@/server/auth/session";
import { recordActivity } from "@/server/audit";
import * as bizin from "@/server/bizin/client";
import { loadKnowledgeDraft, saveKnowledgeDraft } from "@/server/knowledge/draft";

export interface AssistantInput {
  enabled: boolean;
  auto_reply: boolean;
  reply_language: "fa" | "en" | "ar";
  persona_name: string;
  knowledge: KnowledgeDraft;
}

const LANGS = ["fa", "en", "ar"] as const;

/** `business_profile` is compiled here from the sections; a compiled string sent by the client is never used. */
export async function saveAssistantAction(input: AssistantInput): Promise<ActionResult<AssistantInput>> {
  const { shop } = await requireShopOwner();
  const persona = String(input.persona_name ?? "").trim();
  if (!LANGS.includes(input.reply_language)) return { ok: false, field: "reply_language", message: "زبان پاسخ را انتخاب کنید." };
  if ([...persona].length > PERSONA_MAX) return { ok: false, field: "persona_name", message: "نام دستیار حداکثر ۸۰ نویسه است." };
  const k = checkKnowledge(input.knowledge);
  if (!k.ok) return { ok: false, field: k.field, message: k.message };
  try {
    const a = await bizin.updateAssistant(shop.external_business_id, {
      enabled: Boolean(input.enabled),
      auto_reply: Boolean(input.auto_reply),
      reply_language: input.reply_language,
      persona_name: persona,
      business_profile: k.compiled,
    });
    saveKnowledgeDraft(shop.id, k.draft);
    recordActivity(await requireShopOwner(), "assistant.save");
    revalidatePath("/panel");
    return {
      ok: true,
      data: {
        enabled: a.enabled,
        auto_reply: a.auto_reply,
        reply_language: a.reply_language,
        persona_name: a.persona_name,
        knowledge: loadKnowledgeDraft(shop.id, a.business_profile),
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
  const { shop } = await requireShopOwner();
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
    recordActivity(await requireShopOwner(), "assistant.save", { type: "return_policy" });
    return { ok: true, data: { enabled: p.enabled, window_days: p.window_days, conditions: p.conditions } };
  } catch (e) {
    return actionError(e);
  }
}
