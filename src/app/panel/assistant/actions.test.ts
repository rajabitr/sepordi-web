import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compileKnowledge, emptyDraft } from "@/components/panel/assistant/knowledge";
import { PROFILE_MAX } from "@/components/panel/assistant/limits";
import { openDb, setDbForTests } from "@/server/db";
import { loadKnowledgeDraft } from "@/server/knowledge/draft";

const updateAssistant = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const who = vi.hoisted(() => ({ role: "owner" as "owner" | "agent" }));
vi.mock("@/server/auth/session", () => {
  const ctx = () => ({ user: { id: "u1" }, shop: { id: "shop-local-1", external_business_id: "shop-1" }, role: who.role });
  return {
    requireSeller: async () => ctx(),
    requireShopOwner: async () => {
      if (who.role !== "owner") throw new Error("NEXT_REDIRECT /panel");
      return ctx();
    },
  };
});
vi.mock("@/server/bizin/client", () => ({ updateAssistant: (...a: unknown[]) => updateAssistant(...a) }));

const { saveAssistantAction } = await import("./actions");

const base = { enabled: true, auto_reply: true, reply_language: "fa" as const, persona_name: "سارا" };

beforeEach(() => {
  setDbForTests(openDb(":memory:"));
  who.role = "owner";
  updateAssistant.mockReset();
  updateAssistant.mockImplementation(async (_ext: string, body: Record<string, unknown>) => ({ ...body, updated_at: "2026-10-21T00:00:00Z" }));
});
afterEach(() => setDbForTests(undefined));

describe("saveAssistantAction", () => {
  it("sends the profile it compiled itself, ignoring a client-sent business_profile", async () => {
    const knowledge = { ...emptyDraft(), hours: "۱۰ تا ۲۰" };
    const forged = { ...base, knowledge, business_profile: "x".repeat(PROFILE_MAX + 1) };
    const r = await saveAssistantAction(forged);
    expect(r.ok).toBe(true);
    expect(updateAssistant).toHaveBeenCalledWith("shop-1", expect.objectContaining({ business_profile: compileKnowledge(knowledge) }));
    expect(loadKnowledgeDraft("shop-local-1", compileKnowledge(knowledge))).toEqual(knowledge);
  });

  it("refuses sections that compile over the cap, without calling bizin", async () => {
    const knowledge = { ...emptyDraft(), about: "ب".repeat(PROFILE_MAX - 30), notes: "ن".repeat(40) };
    const r = await saveAssistantAction({ ...base, knowledge });
    expect(r).toMatchObject({ ok: false, field: "business_profile" });
    expect(updateAssistant).not.toHaveBeenCalled();
  });

  it("refuses a half-filled FAQ pair, without calling bizin", async () => {
    const r = await saveAssistantAction({ ...base, knowledge: { ...emptyDraft(), faq: [{ q: "سؤال؟", a: "" }] } });
    expect(r).toMatchObject({ ok: false, field: "faq" });
    expect(updateAssistant).not.toHaveBeenCalled();
  });

  it("refuses an agent of the shop server-side, without calling bizin", async () => {
    who.role = "agent";
    await expect(saveAssistantAction({ ...base, knowledge: { ...emptyDraft(), hours: "۱۰ تا ۲۰" } })).rejects.toThrow("NEXT_REDIRECT");
    expect(updateAssistant).not.toHaveBeenCalled();
  });
});
