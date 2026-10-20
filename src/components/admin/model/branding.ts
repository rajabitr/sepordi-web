/*
 * Browser-safe checks for the branding screen. Bizin stays the judge of a disclosure (P6, reasons below); these
 * only spare the operator a round trip and explain the rule while they type.
 */

export const DISCLOSURE_MIN = 20;
export const DISCLOSURE_MAX = 220;

const BOT_WORDS = ["خودکار", "ربات", "هوش مصنوعی", "دستیار", "اتوماتیک", "ماشینی"];
const HUMAN_WORDS = ["انسان", "اپراتور", "همکار", "کارشناس", "پشتیبان", "فروشنده", "شخص"];

export interface DisclosureCheck {
  /** Characters as Bizin counts them (code points, after trimming). */
  length: number;
  tooShort: boolean;
  tooLong: boolean;
  saysAutomated: boolean;
  offersHuman: boolean;
}

export function checkDisclosure(text: string): DisclosureCheck {
  const t = text.trim();
  const length = [...t].length;
  return {
    length,
    tooShort: length < DISCLOSURE_MIN,
    tooLong: length > DISCLOSURE_MAX,
    saysAutomated: BOT_WORDS.some((w) => t.includes(w)),
    offersHuman: HUMAN_WORDS.some((w) => t.includes(w)),
  };
}

/** The P6 rule Bizin says the text breaks (`params.reason` of `disclosure_invalid`). */
export const DISCLOSURE_REASON_FA: Record<string, string> = {
  empty: "متن خالی است.",
  too_short: "متن باید دست‌کم ۲۰ نویسه باشد.",
  too_long: "متن باید حداکثر ۲۲۰ نویسه باشد.",
  not_bot: "متن باید صریح بگوید پاسخ‌ها خودکار است (مثلاً «دستیار خودکار»).",
  no_human: "متن باید بگوید مشتری می‌تواند با یک انسان گفت‌وگو کند.",
  wrong_script: "متن فارسی باید با حروف فارسی نوشته شود.",
  no_handoff_word: "متن باید راه رسیدن به همکار انسانی را بگوید (مثلاً «بنویسید: اپراتور»).",
};

export const LOGO_MAX_BYTES = 256 * 1024;
export const LOGO_MAX_PX = 512;
export const LOGO_TYPES = ["image/png", "image/webp"] as const;

/** A message in Farsi when the file cannot be a logo by type or size; null when it may be (dimensions aside). */
export function checkLogoFile(file: { type: string; size: number }): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return "لوگو باید PNG یا WebP باشد.";
  if (file.size > LOGO_MAX_BYTES) return "حجم لوگو باید حداکثر ۲۵۶ کیلوبایت باشد.";
  if (file.size === 0) return "فایل خالی است.";
  return null;
}

export function checkLogoSize(width: number, height: number): string | null {
  return width > LOGO_MAX_PX || height > LOGO_MAX_PX ? "ابعاد لوگو باید حداکثر ۵۱۲ در ۵۱۲ پیکسل باشد." : null;
}
