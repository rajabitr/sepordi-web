import "server-only";

import { BOOKING_VIEW } from "@/components/panel/booking/model";
import { requireCapability, requireShopOwner, type SellerContext } from "@/server/auth/session";
import { bookingGate, type BookingGate } from "@/server/bizin/booking/gate";

/** The guard of every booking page: the desk (every role with booking.view) or the owner's setup, then the surface probe. */
export async function openBooking(access: "desk" | "owner"): Promise<{ ctx: SellerContext; gate: BookingGate }> {
  const ctx = access === "owner" ? await requireShopOwner() : await requireCapability(BOOKING_VIEW);
  return { ctx, gate: await bookingGate(ctx.shop.external_business_id) };
}

/** A read whose failure the page renders: JSX stays outside try/catch, where render errors would not be caught. */
export function attempt<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}
