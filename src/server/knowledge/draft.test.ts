import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileKnowledge, emptyDraft } from "@/components/panel/assistant/knowledge";
import { openDb, setDbForTests } from "@/server/db";
import { settings } from "@/server/db/repo";

import { knowledgeKey, loadKnowledgeDraft, saveKnowledgeDraft } from "./draft";

beforeEach(() => setDbForTests(openDb(":memory:")));
afterEach(() => setDbForTests(undefined));

const A = { ...emptyDraft(), hours: "۱۰ تا ۲۰", faq: [{ q: "ارسال رایگان؟", a: "بالای ۲ میلیون." }] };
const B = { ...emptyDraft(), about: "فروشگاه ب", notes: "مؤدب باش." };

describe("knowledge drafts", () => {
  it("keeps each shop's draft under its own key", () => {
    saveKnowledgeDraft("shop-a", A);
    saveKnowledgeDraft("shop-b", B);
    expect(settings.get(knowledgeKey("shop-a"))).toEqual(A);
    expect(settings.get(knowledgeKey("shop-b"))).toEqual(B);
    expect(knowledgeKey("shop-a")).not.toBe(knowledgeKey("shop-b"));
    expect(loadKnowledgeDraft("shop-a", compileKnowledge(A))).toEqual(A);
    expect(loadKnowledgeDraft("shop-b", compileKnowledge(B))).toEqual(B);
    expect(loadKnowledgeDraft("shop-c", "")).toEqual(emptyDraft());
  });

  it("prefers the profile on bizin when it no longer matches the stored draft", () => {
    saveKnowledgeDraft("shop-a", A);
    expect(loadKnowledgeDraft("shop-a", "متنی که در جای دیگری نوشته شده")).toEqual({ ...emptyDraft(), about: "متنی که در جای دیگری نوشته شده" });
  });
});
