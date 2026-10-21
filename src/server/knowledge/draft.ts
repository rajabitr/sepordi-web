import "server-only";

import { compileKnowledge, normalizeDraft, parseKnowledge, type KnowledgeDraft } from "@/components/panel/assistant/knowledge";
import { settings } from "@/server/db/repo";

export const knowledgeKey = (shopId: string) => `assistant_knowledge:${shopId}`;

export function saveKnowledgeDraft(shopId: string, draft: KnowledgeDraft): void {
  settings.set(knowledgeKey(shopId), normalizeDraft(draft));
}

/**
 * The draft for the profile bizin holds now. The stored draft is used only while it still compiles to exactly that
 * text; a profile edited anywhere else is parsed instead.
 */
export function loadKnowledgeDraft(shopId: string, profile: string): KnowledgeDraft {
  const stored = settings.get<unknown>(knowledgeKey(shopId));
  if (stored !== undefined) {
    const draft = normalizeDraft(stored);
    if (compileKnowledge(draft) === profile.replace(/\r\n?/g, "\n").trim()) return draft;
  }
  return parseKnowledge(profile);
}
