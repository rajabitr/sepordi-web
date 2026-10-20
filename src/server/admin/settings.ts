import "server-only";

import { getDb, tx } from "@/server/db";
import { settings } from "@/server/db/repo";
import {
  DEFAULT_CARD_TO_CARD,
  DEFAULT_PLANS,
  DEFAULT_SUPPORT,
  validateCardToCard,
  validatePlans,
  validateSupport,
  type AdminSettings,
} from "@/components/admin/model/settings";

/**
 * The three keys as stored, each seeded with its default the first time staff open them, so the marketing site
 * and the seller panel read the same values the form shows. A stored value that no longer validates is shown
 * as stored and fixed on the next save.
 */
export function loadAdminSettings(): AdminSettings {
  const plans = settings.get<AdminSettings["plans"]>("plans");
  const support = settings.get<AdminSettings["support"]>("support");
  const card = settings.get<AdminSettings["card_to_card"]>("card_to_card");
  if (plans === undefined) settings.set("plans", DEFAULT_PLANS);
  if (support === undefined) settings.set("support", DEFAULT_SUPPORT);
  if (card === undefined) settings.set("card_to_card", DEFAULT_CARD_TO_CARD);
  const p = validatePlans(plans ?? DEFAULT_PLANS);
  return {
    plans: p.ok ? p.value : DEFAULT_PLANS,
    support: { ...DEFAULT_SUPPORT, ...(support ?? {}) },
    card_to_card: { ...DEFAULT_CARD_TO_CARD, ...(card ?? {}) },
  };
}

export type SaveResult = { ok: true; value: AdminSettings } | { ok: false; errors: Record<string, string> };

/** Validates all three; writes nothing unless every one is valid. */
export function saveAdminSettings(input: unknown): SaveResult {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const plans = validatePlans(raw.plans);
  const support = validateSupport(raw.support);
  const card = validateCardToCard(raw.card_to_card);
  if (!plans.ok || !support.ok || !card.ok) {
    return {
      ok: false,
      errors: { ...(plans.ok ? {} : plans.errors), ...(support.ok ? {} : support.errors), ...(card.ok ? {} : card.errors) },
    };
  }
  tx(getDb(), () => {
    settings.set("plans", plans.value);
    settings.set("support", support.value);
    settings.set("card_to_card", card.value);
  });
  return { ok: true, value: { plans: plans.value, support: support.value, card_to_card: card.value } };
}
