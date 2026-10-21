import { describe, expect, it } from "vitest";

import { checkKnowledge, compileKnowledge, emptyDraft, parseKnowledge, profileLength, type KnowledgeDraft } from "./knowledge";
import { PROFILE_MAX } from "./limits";

const ZWNJ = "‌";

const FULL: KnowledgeDraft = {
  about: `پوشاک زنانه‌ی نخی، دوخت خودمان در تهران.\nفروشگاه حضوری نداریم؛ فقط آنلاین.`,
  hours: "شنبه تا پنج‌شنبه ۱۰ تا ۲۰؛ جمعه‌ها تعطیل‌ایم.",
  shipping: "تهران با پیک همان روز.\n\nشهرستان‌ها با پست پیشتاز، ۲ تا ۴ روز کاری.",
  payment: "کارت‌به‌کارت؛ سفارش بعد از تأیید رسید قطعی می‌شود.",
  warranty: "تعویض سایز تا ۷ روز، به شرط سالم بودن برچسب.",
  faq: [
    { q: `برای شهرستان هم می${ZWNJ}فرستید؟`, a: "بله، به همه‌ی شهرها؛ با پست پیشتاز." },
    { q: "س: سایز «لارج» دارید؟", a: "ج: بله، تا XL — اندازه‌ها در توضیح هر محصول هست." },
    { q: "تخفیف عمده؟", a: "از ۱۰ عدد به بالا، ۱۰٪." },
  ],
  notes: "مشتری را «شما» خطاب کن.\nاز کلمه‌ی «ارزان» استفاده نکن.",
};

describe("compileKnowledge / parseKnowledge", () => {
  it("round-trips every section exactly, including Q/A with Persian punctuation and ZWNJ", () => {
    const text = compileKnowledge(FULL);
    expect(parseKnowledge(text)).toEqual(FULL);
    expect(compileKnowledge(parseKnowledge(text))).toBe(text);
    expect(parseKnowledge(text).faq[0].q).toContain(ZWNJ);
  });

  it("writes the stable heading and س:/ج: format", () => {
    const text = compileKnowledge({ ...emptyDraft(), hours: "۱۰ تا ۲۰", faq: [{ q: "ارسال رایگان؟", a: "بالای ۲ میلیون." }] });
    expect(text).toBe("## ساعت کاری و پاسخ‌گویی\n۱۰ تا ۲۰\n\n## سؤال‌های پرتکرار\nس: ارسال رایگان؟\nج: بالای ۲ میلیون.");
  });

  it("round-trips a single non-about section and every pair of sections", () => {
    const keys = ["about", "hours", "shipping", "payment", "warranty", "faq", "notes"] as const;
    for (const a of keys) {
      for (const b of keys) {
        const d = emptyDraft();
        for (const k of [a, b]) (d as unknown as Record<string, unknown>)[k] = FULL[k];
        expect(parseKnowledge(compileKnowledge(d)), `${a}+${b}`).toEqual(d);
      }
    }
  });

  it("keeps a body line that looks like one of the headings inside its section", () => {
    const d = { ...emptyDraft(), notes: "## پرداخت\nاین را تکرار نکن.", hours: "۹ تا ۵" };
    const back = parseKnowledge(compileKnowledge(d));
    expect(back.notes).toBe("پرداخت\nاین را تکرار نکن.");
    expect(back.payment).toBe("");
  });

  it("puts an unknown legacy profile whole into «درباره» and saves it back unchanged", () => {
    const legacy = "ساعت کاری: شنبه تا پنجشنبه ۱۰ تا ۲۰.\n## یادداشت\nارسال: پست پیشتاز.\nس: بدون جواب";
    const d = parseKnowledge(legacy);
    expect(d).toEqual({ ...emptyDraft(), about: legacy });
    expect(compileKnowledge(d)).toBe(legacy);
  });

  it("treats a malformed FAQ section as legacy text, so nothing is dropped", () => {
    const text = "## ساعت کاری و پاسخ‌گویی\n۱۰ تا ۲۰\n\n## سؤال‌های پرتکرار\nس: سؤال بی‌جواب\nیک خط آزاد";
    expect(parseKnowledge(text)).toEqual({ ...emptyDraft(), about: text });
  });

  it("reads an empty profile as an empty draft", () => {
    expect(parseKnowledge("  \n")).toEqual(emptyDraft());
    expect(compileKnowledge(emptyDraft())).toBe("");
  });
});

describe("checkKnowledge", () => {
  it("caps the compiled length, headings included, not the sum of the fields", () => {
    const heading = "## درباره‌ی کسب‌وکار\n";
    const tail = "\n\n## ساعت کاری و پاسخ‌گویی\nx";
    const fill = PROFILE_MAX - profileLength(heading) - profileLength(tail);
    const atCap = { ...emptyDraft(), about: "ب".repeat(fill), hours: "x" };
    expect(profileLength(compileKnowledge(atCap))).toBe(PROFILE_MAX);
    expect(checkKnowledge(atCap).ok).toBe(true);

    const over = { ...atCap, hours: "xy" };
    expect(over.about.length + over.hours.length).toBeLessThan(PROFILE_MAX);
    const r = checkKnowledge(over);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("business_profile");
  });

  it("refuses a half-filled FAQ pair and drops an empty one", () => {
    const half = checkKnowledge({ ...emptyDraft(), faq: [{ q: "سؤال؟", a: " " }] });
    expect(half.ok).toBe(false);
    if (!half.ok) expect(half.field).toBe("faq");
    const blank = checkKnowledge({ ...emptyDraft(), faq: [{ q: "", a: "" }] });
    expect(blank).toEqual({ ok: true, draft: emptyDraft(), compiled: "" });
  });
});
