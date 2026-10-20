import { describe, expect, it } from "vitest";

import { checkDisclosure, checkLogoFile, checkLogoSize } from "./branding";
import { ALL_SCOPES, missingScopes } from "./labels";
import { parseOnboardingList } from "./onboarding";
import { DEFAULT_PLANS, validatePlans } from "./settings";

describe("scopes", () => {
  it("knows all 27 and names the missing ones", () => {
    expect(ALL_SCOPES).toHaveLength(27);
    expect(missingScopes(ALL_SCOPES)).toEqual([]);
    expect(missingScopes(ALL_SCOPES.filter((s) => s !== "webhooks:manage" && s !== "branding:write"))).toEqual(["webhooks:manage", "branding:write"]);
  });
});

describe("disclosure", () => {
  it("counts code points and checks both duties", () => {
    const good = checkDisclosure("سلام! من دستیار خودکار این فروشگاه هستم. برای گفت‌وگو با همکار ما بنویسید: اپراتور");
    expect(good).toMatchObject({ tooShort: false, tooLong: false, saysAutomated: true, offersHuman: true });
    expect(checkDisclosure("  سلام  ")).toMatchObject({ length: 4, tooShort: true, saysAutomated: false, offersHuman: false });
    expect(checkDisclosure("ب".repeat(221)).tooLong).toBe(true);
    expect(checkDisclosure("ب".repeat(220)).tooLong).toBe(false);
  });
});

describe("logo", () => {
  it("accepts PNG/WebP up to 256 KiB and 512 px", () => {
    expect(checkLogoFile({ type: "image/png", size: 256 * 1024 })).toBeNull();
    expect(checkLogoFile({ type: "image/png", size: 256 * 1024 + 1 })).toMatch(/۲۵۶/);
    expect(checkLogoFile({ type: "image/jpeg", size: 10 })).toMatch(/PNG/);
    expect(checkLogoSize(512, 512)).toBeNull();
    expect(checkLogoSize(513, 100)).not.toBeNull();
  });
});

describe("onboarding list", () => {
  it("reads comma, Persian comma and tab rows and reports a bad line by number", () => {
    const r = parseOnboardingList(
      ["shop-1, گالری نیلا, user-1, Nila@Example.com, نیلوفر کاظمی, ۰۹۱۲۰۰۰۰۰۰۱", "", "shop-2،کتاب‌سرا،user-2،a@b.co،رضا", "shop-3\tنام\tuser-3\tnot-an-email\tعلی"].join("\n"),
    );
    expect(r.rows).toEqual([
      { external_business_id: "shop-1", name: "گالری نیلا", owner: { external_user_id: "user-1", email: "nila@example.com", display_name: "نیلوفر کاظمی", phone: "09120000001", locale: "fa" } },
      { external_business_id: "shop-2", name: "کتاب‌سرا", owner: { external_user_id: "user-2", email: "a@b.co", display_name: "رضا", locale: "fa" } },
    ]);
    expect(r.errors).toEqual([{ line: 4, message: "سطر ۴: ایمیل مالک درست نیست." }]);
  });
});

describe("plans", () => {
  it("allows one highlighted plan only", () => {
    expect(validatePlans(DEFAULT_PLANS).ok).toBe(true);
    const two = validatePlans(DEFAULT_PLANS.map((p) => ({ ...p, highlight: p.code !== "free" && p.code !== "bronze" })));
    expect(two).toMatchObject({ ok: false, errors: { "plans.highlight": expect.any(String) } });
  });
});
