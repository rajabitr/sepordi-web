import { describe, expect, it } from "vitest";

import { formatDate, formatDateNumeric, formatTime, jalaliYear, relativeTime } from "./date";
import { formatToman, formatTomanValue, rialToToman, tomanToRial } from "./money";

describe("money", () => {
  it("converts Rial and Toman both ways", () => {
    expect(rialToToman(124_500_000)).toBe(12_450_000);
    expect(tomanToRial(12_450_000)).toBe(124_500_000);
    expect(rialToToman(tomanToRial(98_765))).toBe(98_765);
  });

  it("formats a Rial amount as Toman with Persian digits", () => {
    expect(formatToman(124_500_000)).toBe("۱۲٬۴۵۰٬۰۰۰ تومان");
    expect(formatToman(0)).toBe("۰ تومان");
    expect(formatTomanValue(45_000)).toBe("۴۵٬۰۰۰ تومان");
  });
});

describe("date", () => {
  // 21:30 UTC is 01:00 the next day in Tehran (UTC+03:30, no DST since 1401).
  const iso = "2026-10-20T21:30:00Z";

  it("formats Jalali in Asia/Tehran regardless of the server zone", () => {
    expect(formatDate(iso)).toBe("۲۹ مهر ۱۴۰۵");
    expect(formatDateNumeric(iso)).toBe("۱۴۰۵/۰۷/۲۹");
    expect(formatTime(iso)).toBe("۰۱:۰۰");
    expect(jalaliYear(iso)).toBe(1405);
    expect(jalaliYear("2027-03-21T00:00:00Z")).toBe(1406);
  });

  it("says relative time in Farsi", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(relativeTime("2026-10-20T11:59:50Z", now)).toBe("همین حالا");
    expect(relativeTime("2026-10-20T11:55:00Z", now)).toBe("۵ دقیقه پیش");
    expect(relativeTime("2026-10-20T09:00:00Z", now)).toBe("۳ ساعت پیش");
    expect(relativeTime("2026-10-19T12:00:00Z", now)).toBe("دیروز");
    expect(relativeTime("2026-10-16T12:00:00Z", now)).toBe("۴ روز پیش");
    expect(relativeTime("2026-10-20T14:00:00Z", now)).toBe("۲ ساعت دیگر");
  });
});
