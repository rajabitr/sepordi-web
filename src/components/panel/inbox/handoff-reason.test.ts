import { describe, expect, it } from "vitest";

import { explainHandoff, GENERIC_HANDOFF, handoffReasonLabel } from "./handoff-reason";
import type { Conversation } from "./model";

type Handoff = NonNullable<Conversation["handoff"]>;
const h = (reason: string | null, reason_class?: Handoff["reason_class"]): Handoff => ({ reason, raised_at: null, reason_class });

describe("explainHandoff", () => {
  it("tells the seller what to do when no product matched", () => {
    const e = explainHandoff(h("no_product_matched", "NONE"));
    expect(e.label).toBe("محصول پیدا نشد");
    expect(e.detail).toBe("دستیار این مورد را در محصولات شما پیدا نکرد. خودتان جواب بدهید، یا محصولش را اضافه کنید و گفت‌وگو را به دستیار برگردانید.");
  });

  it("explains the reasons bizin raises most, each with its own label", () => {
    const tokens = ["model_requested_human", "customer_requested_human", "receipt_received", "low_confidence", "customer_opted_out", "out_of_credit"];
    const labels = tokens.map((t) => explainHandoff(h(t)).label);
    expect(new Set(labels).size).toBe(tokens.length);
    for (const l of labels) expect(l).not.toBe(GENERIC_HANDOFF.label);
  });

  it("falls back to the class for an unknown token, then to a generic line", () => {
    expect(handoffReasonLabel(h("brand_new_reason", "PAYMENT_VERIFICATION"))).toBe("بررسی رسید پرداخت");
    expect(explainHandoff(h("brand_new_reason", "NONE"))).toEqual(GENERIC_HANDOFF);
    expect(explainHandoff(h("brand_new_reason"))).toEqual(GENERIC_HANDOFF);
    expect(explainHandoff(h(null))).toEqual(GENERIC_HANDOFF);
    expect(explainHandoff(null)).toEqual(GENERIC_HANDOFF);
  });

  it("never reads an inherited key as a reason", () => {
    expect(explainHandoff(h("constructor"))).toEqual(GENERIC_HANDOFF);
    expect(explainHandoff(h("toString"))).toEqual(GENERIC_HANDOFF);
  });

  it("prefers the reason over its class", () => {
    expect(handoffReasonLabel(h("discount_request", "POLICY_REQUIRED"))).toBe("مشتری تخفیف خواست");
  });
});
