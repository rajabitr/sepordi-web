import { describe, expect, it } from "vitest";

import { BizinError } from "@/server/bizin/error";

import { isNotEntitled } from "./entitlement";

describe("isNotEntitled", () => {
  it("maps a thrown 403 feature_not_entitled to the plan state", () => {
    expect(isNotEntitled(new BizinError({ status: 403, code: "feature_not_entitled", params: { feature: "shipping.rules" } }))).toBe(true);
  });

  it("maps a failed settle result the same way", () => {
    expect(isNotEntitled({ ok: false, status: 403, code: "feature_not_entitled", message: "x" })).toBe(true);
  });

  it("leaves every other failure to the load error", () => {
    expect(isNotEntitled(new BizinError({ status: 403, code: "insufficient_scope" }))).toBe(false);
    expect(isNotEntitled(new BizinError({ status: 403, code: "entitlement_exceeded" }))).toBe(false);
    expect(isNotEntitled(new BizinError({ status: 404, code: "not_found" }))).toBe(false);
    expect(isNotEntitled(new BizinError({ status: 0, code: "network_error" }))).toBe(false);
    expect(isNotEntitled(new Error("feature_not_entitled"))).toBe(false);
    expect(isNotEntitled(undefined)).toBe(false);
  });
});
