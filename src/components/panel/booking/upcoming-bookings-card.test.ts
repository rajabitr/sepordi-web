import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingGate } from "@/server/bizin/booking/gate";

const state = { seller: null as unknown, gate: { state: "coming_soon" } as BookingGate };
const listBookings = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSeller: async () => state.seller }));
vi.mock("@/server/bizin/booking/gate", () => ({ bookingGate: async () => state.gate }));
vi.mock("@/server/bizin/booking/client", () => ({ listBookings: (...a: unknown[]) => listBookings(...a) }));

const { UpcomingBookingsCard } = await import("./upcoming-bookings-card");

const seller = { user: { id: "u1" }, shop: { id: "s1", external_business_id: "shop-1" }, role: "owner" };

beforeEach(() => {
  state.seller = seller;
  listBookings.mockReset();
  listBookings.mockResolvedValue({ bookings: [], next_cursor: null });
});

describe("UpcomingBookingsCard", () => {
  it.each<BookingGate>([{ state: "coming_soon" }, { state: "not_entitled" }, { state: "no_scope" }, { state: "error", message: "x" }])(
    "renders nothing while the gate says %o",
    async (gate) => {
      state.gate = gate;
      expect(await UpcomingBookingsCard({})).toBeNull();
      expect(listBookings).not.toHaveBeenCalled();
    },
  );

  it("renders nothing for a member without booking.view", async () => {
    state.seller = null;
    state.gate = { state: "ready", settings: {} as never };
    expect(await UpcomingBookingsCard({})).toBeNull();
    expect(listBookings).not.toHaveBeenCalled();
  });

  it("renders the card once the gate is ready", async () => {
    state.gate = { state: "ready", settings: {} as never };
    expect(await UpcomingBookingsCard({})).not.toBeNull();
    expect(listBookings).toHaveBeenCalledWith("shop-1", expect.objectContaining({ sort: "starts_at", limit: 5 }));
  });
});
