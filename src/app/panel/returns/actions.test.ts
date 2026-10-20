import { beforeEach, describe, expect, it, vi } from "vitest";

const actOnCase = vi.fn();
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireSeller: async () => ({ user: { id: "u1" }, shop: { external_business_id: "shop-1" } }),
}));
vi.mock("@/server/bizin/client", () => ({ actOnCase: (...a: unknown[]) => actOnCase(...a) }));

const { actOnCaseAction } = await import("./actions");

const CASE = "6f1c2a8b-0000-4000-8000-000000000001";

beforeEach(() => {
  actOnCase.mockReset();
  actOnCase.mockResolvedValue({});
});

describe("actOnCaseAction", () => {
  it("sends the shop's own ext, the seen state and only the fields of the action", async () => {
    const r = await actOnCaseAction(
      CASE,
      { action: "mark_refunded", expectedState: "accepted", refundAmount: 120_000_000, refundReference: "۱۲۳۴", rejectReason: "other", note: " paid ", notifyCustomer: false },
      "key-1",
    );
    expect(r).toEqual({ ok: true });
    expect(actOnCase).toHaveBeenCalledWith(
      "shop-1",
      CASE,
      { action: "mark_refunded", expected_state: "accepted", refund: { amount: 120_000_000, reference: "1234" }, note: "paid", notify_customer: false },
      { idempotencyKey: "key-1" },
    );
  });

  it("refuses an action the seen state does not allow, without calling the API", async () => {
    const r = await actOnCaseAction(CASE, { action: "mark_refunded", expectedState: "open", notifyCustomer: true }, "key-2");
    expect(r.ok).toBe(false);
    expect(actOnCase).not.toHaveBeenCalled();
  });

  it("needs a reason to reject", async () => {
    const r = await actOnCaseAction(CASE, { action: "reject", expectedState: "open", notifyCustomer: true }, "key-3");
    expect(r).toMatchObject({ ok: false, code: "invalid_value" });
    expect(actOnCase).not.toHaveBeenCalled();
  });

  it("answers a state conflict with its code so the page can explain and re-read", async () => {
    const { BizinError } = await import("@/server/bizin/error");
    actOnCase.mockRejectedValue(new BizinError({ status: 409, code: "case_state_conflict", requestId: "rid" }));
    const r = await actOnCaseAction(CASE, { action: "accept", expectedState: "open", notifyCustomer: true }, "key-4");
    expect(r).toMatchObject({ ok: false, code: "case_state_conflict", requestId: "rid" });
  });
});
