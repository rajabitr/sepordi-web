import { beforeEach, describe, expect, it, vi } from "vitest";

const api = { setOrderStatus: vi.fn(), approvePaymentEvidence: vi.fn(), rejectPaymentEvidence: vi.fn(), markOrderPaid: vi.fn() };
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/server/auth/session", () => ({
  requireSeller: async () => ({ user: { id: "u1" }, shop: { external_business_id: "shop-1" } }),
}));
vi.mock("@/server/bizin/client", () => ({
  setOrderStatus: (...a: unknown[]) => api.setOrderStatus(...a),
  approvePaymentEvidence: (...a: unknown[]) => api.approvePaymentEvidence(...a),
  rejectPaymentEvidence: (...a: unknown[]) => api.rejectPaymentEvidence(...a),
  markOrderPaid: (...a: unknown[]) => api.markOrderPaid(...a),
  listOrders: vi.fn(),
}));

const { markPaidAction, moveOrderAction, rejectEvidenceAction } = await import("./actions");

const ORDER = "9b3f6e12-0000-4000-8000-000000000001";
const EVIDENCE = "9b3f6e12-0000-4000-8000-000000000002";

beforeEach(() => {
  for (const f of Object.values(api)) {
    f.mockReset();
    f.mockResolvedValue({});
  }
});

describe("order actions", () => {
  it("never sends paid as a status move", async () => {
    const r = await moveOrderAction(ORDER, "paid" as never, "k1");
    expect(r.ok).toBe(false);
    expect(api.setOrderStatus).not.toHaveBeenCalled();
    await moveOrderAction(ORDER, "shipped", "k2");
    expect(api.setOrderStatus).toHaveBeenCalledWith("shop-1", ORDER, { status: "shipped" }, { idempotencyKey: "k2" });
  });

  it("rejects a receipt only with a known reason", async () => {
    expect((await rejectEvidenceAction(ORDER, EVIDENCE, "because" as never, "", "k3")).ok).toBe(false);
    expect(api.rejectPaymentEvidence).not.toHaveBeenCalled();
    await rejectEvidenceAction(ORDER, EVIDENCE, "amount_mismatch", "  ", "k4");
    expect(api.rejectPaymentEvidence).toHaveBeenCalledWith("shop-1", ORDER, EVIDENCE, { reason: "amount_mismatch" }, { idempotencyKey: "k4" });
  });

  it("stores the bank reference with Latin digits", async () => {
    await markPaidAction(ORDER, " ۹۸۷۶۵ ", "k5");
    expect(api.markOrderPaid).toHaveBeenCalledWith("shop-1", ORDER, { reference: "98765" }, { idempotencyKey: "k5" });
  });

  it("refuses an id that is not a uuid", async () => {
    expect((await markPaidAction("../tenants/other", "", "k6")).ok).toBe(false);
    expect(api.markOrderPaid).not.toHaveBeenCalled();
  });
});
