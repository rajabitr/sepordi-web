import { describe, expect, it } from "vitest";

import { fa, faNumber } from "@/lib/utils";
import {
  formatCardNumber,
  formatIban,
  formatIbanDigits,
  formatIranMobile,
  formatPostalCode,
  isIban,
  normalizeCardNumber,
  normalizeIban,
  normalizeIranMobile,
  normalizePostalCode,
} from "@/lib/persian";
import { parseAmount } from "./amount-input";

// Each field renders display(value) and feeds the edited display string back
// through onChange, so typing one key at the end must keep every digit.
function typeKeys(keys: string, display: (v: string) => string, next: (raw: string) => string): string {
  let value = next("");
  for (const k of keys) value = next(display(value) + k);
  return value;
}

const IBAN_DIGITS = "120170000000102345678901";

const ibanNext = (raw: string) => normalizeIban("IR" + raw);

describe("IbanInput display", () => {
  it("round-trips every single keystroke 1…24", () => {
    let iban = ibanNext("");
    for (let i = 1; i <= 24; i++) {
      iban = ibanNext(formatIbanDigits(iban) + IBAN_DIGITS[i - 1]);
      expect(iban).toBe("IR" + IBAN_DIGITS.slice(0, i));
    }
  });

  it("shows exactly the 24 digits after «IR», grouped like the placeholder", () => {
    expect(formatIbanDigits("IR")).toBe("");
    expect(formatIbanDigits("IR1")).toBe("1");
    expect(formatIbanDigits("IR" + IBAN_DIGITS)).toBe("12 0170 0000 0010 2345 6789 01");
    expect(formatIbanDigits("IR" + IBAN_DIGITS).replace(/\d/g, "0")).toBe("00 0000 0000 0000 0000 0000 00");
  });

  it("keeps all 24 digits of a pasted IBAN, Latin or Persian", () => {
    const pasted = "IR12 3456 7890 1234 5678 9012 34";
    expect(ibanNext(pasted)).toBe("IR123456789012345678901234");
    expect(ibanNext(fa(pasted))).toBe("IR123456789012345678901234");
    expect(ibanNext("۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴")).toBe("IR123456789012345678901234");
  });

  it("is stable: display(normalize(x)) feeds back to the same value", () => {
    for (const x of ["IR", "IR1", "IR12", "IR123", "IR12 3456", "IR" + IBAN_DIGITS, "ir12 0170 ۰۰۰۰"]) {
      const iban = normalizeIban(x);
      expect(ibanNext(formatIbanDigits(iban))).toBe(iban);
      expect(formatIbanDigits(ibanNext(formatIbanDigits(iban)))).toBe(formatIbanDigits(iban));
    }
  });

  it("deletes from the middle and caps at 24 digits", () => {
    const shown = formatIbanDigits("IR" + IBAN_DIGITS);
    expect(ibanNext(shown.slice(0, 4) + shown.slice(5))).toBe("IR" + IBAN_DIGITS.slice(0, 3) + IBAN_DIGITS.slice(4));
    expect(ibanNext(shown + "9")).toBe("IR" + IBAN_DIGITS);
  });

  it("matches formatIban without the «IR» group", () => {
    const iban = "IR" + IBAN_DIGITS;
    expect("IR" + formatIbanDigits(iban)).toBe(formatIban(iban));
    expect(isIban(ibanNext(formatIbanDigits(iban)))).toBe(isIban(iban));
  });
});

describe("CardNumberInput display", () => {
  it("round-trips every single keystroke 1…16, Persian keys too", () => {
    const card = "6037991122334455";
    expect(typeKeys(card, formatCardNumber, normalizeCardNumber)).toBe(card);
    expect(typeKeys(fa(card), formatCardNumber, normalizeCardNumber)).toBe(card);
    expect(normalizeCardNumber(formatCardNumber(card) + "7")).toBe(card);
  });

  it("keeps all 16 digits of a padded paste", () => {
    expect(normalizeCardNumber("  6037 - 9911 - 2233 - 4455  ")).toBe("6037991122334455");
  });
});

describe("PhoneInput display", () => {
  it("round-trips every single keystroke, a leading 0 included", () => {
    expect(typeKeys("9123456789", formatIranMobile, normalizeIranMobile)).toBe("9123456789");
    expect(typeKeys("09123456789", formatIranMobile, normalizeIranMobile)).toBe("9123456789");
    expect(typeKeys("۰۹۱۲۳۴۵۶۷۸۹", formatIranMobile, normalizeIranMobile)).toBe("9123456789");
  });

  it("is stable on its own display", () => {
    for (const d of ["9", "912", "9123", "912345", "9123456", "9123456789"]) {
      expect(normalizeIranMobile(formatIranMobile(d))).toBe(d);
    }
  });
});

describe("PostalCodeInput display", () => {
  it("round-trips every single keystroke 1…10", () => {
    expect(typeKeys("8163847351", formatPostalCode, normalizePostalCode)).toBe("8163847351");
    expect(typeKeys("۸۱۶۳۸۴۷۳۵۱", formatPostalCode, normalizePostalCode)).toBe("8163847351");
    expect(normalizePostalCode(formatPostalCode("8163847351") + "9")).toBe("8163847351");
  });
});

describe("AmountInput display", () => {
  const display = (v: string) => (v === "" ? "" : faNumber(Number(v)));
  const next = (raw: string) => String(parseAmount(raw) ?? "");

  it("round-trips every single keystroke through the «٬» separators", () => {
    expect(typeKeys("12500000", display, next)).toBe("12500000");
    expect(typeKeys("۱۲۵۰۰۰۰۰", display, next)).toBe("12500000");
    expect(typeKeys("0012", display, next)).toBe("12");
  });

  it("parses a pasted amount and caps at 15 digits", () => {
    expect(parseAmount("۱۲٬۴۵۰٬۰۰۰ تومان")).toBe(12_450_000);
    expect(parseAmount("12,450,000")).toBe(12_450_000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("1234567890123456789")).toBe(123_456_789_012_345);
  });
});
