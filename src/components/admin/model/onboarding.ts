import { normalizeMobile } from "@/lib/phone";
import { fa } from "@/lib/utils";

/*
 * The pasted-list form of a bulk onboarding job: one business per line, the columns of the file template in this
 * order. Bizin validates every row again; this only catches a line that cannot be a row at all.
 */

export const LIST_COLUMNS = ["شناسه‌ی فروشگاه", "نام فروشگاه", "شناسه‌ی کاربر مالک", "ایمیل مالک", "نام مالک", "موبایل (اختیاری)"] as const;

export const MAX_LIST_ROWS = 2000;

/** The market defaults sepordi onboards with; a file's own columns win over them. */
export const ONBOARDING_DEFAULTS = { market_profile: "ir", reply_language: "fa", owner_locale: "fa" } as const;

export interface ListRow {
  external_business_id: string;
  name: string;
  owner: { external_user_id: string; email: string; display_name: string; phone?: string; locale: "fa" };
}

export interface ListParse {
  rows: ListRow[];
  errors: { line: number; message: string }[];
}

export function parseOnboardingList(text: string): ListParse {
  const rows: ListRow[] = [];
  const errors: ListParse["errors"] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = raw.split(/\t|,|،/).map((c) => c.trim());
    const [ext, name, userId, email, display, phoneRaw] = cells;
    if (cells.length < 5 || !ext || !name || !userId || !email || !display) {
      errors.push({ line, message: `سطر ${fa(line)}: پنج ستون اول لازم است.` });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ line, message: `سطر ${fa(line)}: ایمیل مالک درست نیست.` });
      return;
    }
    let phone: string | undefined;
    if (phoneRaw) {
      const n = normalizeMobile(phoneRaw);
      if (!n) {
        errors.push({ line, message: `سطر ${fa(line)}: موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.` });
        return;
      }
      phone = n;
    }
    rows.push({
      external_business_id: ext,
      name,
      owner: { external_user_id: userId, email: email.toLowerCase(), display_name: display, ...(phone ? { phone } : {}), locale: "fa" },
    });
  });
  if (rows.length > MAX_LIST_ROWS) errors.push({ line: 0, message: `حداکثر ${fa(MAX_LIST_ROWS)} فروشگاه در یک نوبت.` });
  return { rows, errors };
}
