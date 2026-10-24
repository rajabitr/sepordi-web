import "server-only";

import { cache } from "react";

import type { EntitledSection } from "@/components/panel/shell/nav";
import { getShopEntitlements } from "@/server/bizin/client";

/** Contract features (partner-api.md §8.19) and the panel section each one opens. */
export const FEATURE_SECTIONS: Record<string, EntitledSection> = {
  "inbox.api": "inbox",
  "returns.cases": "returns",
  "shipping.rules": "shipping",
  "payments.verification": "receipts",
};

/** The sections a features map leaves out. A feature the answer does not name is not hidden. */
export function hiddenSections(features: Record<string, { allowed: boolean } | undefined>): EntitledSection[] {
  return Object.entries(FEATURE_SECTIONS)
    .filter(([feature]) => features[feature]?.allowed === false)
    .map(([, section]) => section);
}

/**
 * The panel sections the shop's plan leaves out, read once per request. Fails open (hides nothing): a page whose
 * feature is off answers 403 `feature_not_entitled` and shows its own state.
 */
export const hiddenSectionsFor = cache(async (ext: string): Promise<EntitledSection[]> => {
  try {
    return hiddenSections((await getShopEntitlements(ext)).features);
  } catch {
    return [];
  }
});
