import { beforeEach, describe, expect, it, vi } from "vitest";

const api = { actOnBooking: vi.fn(), rescheduleBooking: vi.fn(), putBookingSettings: vi.fn(), deleteBookingService: vi.fn(), putBookingHours: vi.fn() };
const recordActivity = vi.fn();
const ctx = { user: { id: "u1" }, shop: { id: "s1", external_business_id: "shop-1" }, role: "owner" };
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireCapability: async () => ctx, requireShopOwner: async () => ctx }));
vi.mock("@/server/audit", () => ({ recordActivity: (...a: unknown[]) => recordActivity(...a) }));
vi.mock("@/server/bizin/booking/client", () => ({
  actOnBooking: (...a: unknown[]) => api.actOnBooking(...a),
  rescheduleBooking: (...a: unknown[]) => api.rescheduleBooking(...a),
  putBookingSettings: (...a: unknown[]) => api.putBookingSettings(...a),
  deleteBookingService: (...a: unknown[]) => api.deleteBookingService(...a),
  putBookingHours: (...a: unknown[]) => api.putBookingHours(...a),
  listBookingSlots: vi.fn(),
  getBookingSettings: vi.fn(),
}));

const { bookingAction, rescheduleAction } = await import("./actions");
const { archiveServiceAction, saveHoursAction, saveSettingsAction } = await import("./setup-actions");

const BOOKING = "4c1e9f7d-0000-4000-8000-000000000001";
const RESOURCE = "4c1e9f7d-0000-4000-8000-000000000002";
const SETTINGS = {
  assistantEnabled: true,
  holidaysCloseBooking: true,
  horizonDays: 30,
  minNoticeMin: 60,
  slotStepMin: 30,
  maxPerDay: null,
  cancelCutoffMin: 120,
  paymentWindowMin: 60,
  paymentInstructions: "",
  noShowAfterMin: 15,
};

beforeEach(() => {
  recordActivity.mockReset();
  for (const f of Object.values(api)) {
    f.mockReset();
    f.mockResolvedValue({});
  }
});

describe("booking activity log", () => {
  it("records a desk move and a reschedule after Bizin accepted them", async () => {
    expect((await bookingAction(BOOKING, "no-show", "", "k1")).ok).toBe(true);
    expect(recordActivity).toHaveBeenLastCalledWith(ctx, "booking.no_show", { type: "booking", id: BOOKING });
    expect((await bookingAction(BOOKING, "confirm-payment", "", "k2")).ok).toBe(true);
    expect(recordActivity).toHaveBeenLastCalledWith(ctx, "booking.payment_confirm", { type: "booking", id: BOOKING });
    expect((await rescheduleAction(BOOKING, "2026-11-01T06:30:00Z", RESOURCE, "k3")).ok).toBe(true);
    expect(recordActivity).toHaveBeenLastCalledWith(ctx, "booking.reschedule", { type: "booking", id: BOOKING }, { starts_at: "2026-11-01T06:30:00.000Z" });
  });

  it("records the owner's setup changes", async () => {
    expect((await saveSettingsAction(SETTINGS)).ok).toBe(true);
    expect(recordActivity).toHaveBeenLastCalledWith(ctx, "booking.settings_save", null);
    expect((await archiveServiceAction("svc_1", "k4")).ok).toBe(true);
    expect(recordActivity).toHaveBeenLastCalledWith(ctx, "booking.service_archive", { type: "booking_service", id: "svc_1" });
  });

  it("records nothing when Bizin refuses or the input is stale", async () => {
    api.actOnBooking.mockRejectedValue(new Error("boom"));
    api.rescheduleBooking.mockRejectedValue(new Error("boom"));
    api.putBookingSettings.mockRejectedValue(new Error("boom"));
    api.putBookingHours.mockRejectedValue(new Error("boom"));
    expect((await bookingAction(BOOKING, "approve", "", "k5")).ok).toBe(false);
    expect((await rescheduleAction(BOOKING, "2026-11-01T06:30:00Z", RESOURCE, "k6")).ok).toBe(false);
    expect((await saveSettingsAction(SETTINGS)).ok).toBe(false);
    expect((await saveHoursAction([])).ok).toBe(false);
    expect((await bookingAction("not-a-uuid", "approve", "", "k7")).ok).toBe(false);
    expect((await archiveServiceAction("svc 1", "k8")).ok).toBe(false);
    expect(recordActivity).not.toHaveBeenCalled();
  });
});
