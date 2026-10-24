import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BizinError } from "../error";
import { resetWorld } from "../mock";
import type { TransportRequest } from "../transport";
import * as booking from "./client";
import { bookingGate, classifyBookingGate } from "./gate";

const env = { ...process.env };

beforeEach(() => {
  resetWorld();
  process.env.BIZIN_MODE = "mock";
});
afterEach(() => {
  process.env = { ...env };
  booking.setBookingTransportForTests(undefined);
});

function capture(responses: Response[]) {
  const seen: TransportRequest[] = [];
  booking.setBookingTransportForTests(async (req) => {
    seen.push(req);
    return responses.shift() ?? new Response("{}", { status: 200 });
  });
  return seen;
}

const err = (status: number, code: string) => new Response(JSON.stringify({ error: code, code, message: "", request_id: "r1" }), { status });

describe("production gating", () => {
  it("reads 404 (flag off) and 501 (frozen contract) as coming soon", async () => {
    capture([err(404, "not_found")]);
    expect(await bookingGate("shop-a")).toEqual({ state: "coming_soon" });
    capture([err(501, "not_implemented")]);
    expect(await bookingGate("shop-b")).toEqual({ state: "coming_soon" });
    capture([new Response(null, { status: 404 })]);
    expect(await bookingGate("shop-c")).toEqual({ state: "coming_soon" });
  });

  it("tells the plan apart from sepordi's missing scope", () => {
    expect(classifyBookingGate(new BizinError({ status: 403, code: "feature_not_entitled" }))).toEqual({ state: "not_entitled" });
    expect(classifyBookingGate(new BizinError({ status: 403, code: "insufficient_scope" }))).toEqual({ state: "no_scope" });
  });

  it("keeps a real 404 of the shop and every other failure an error with Farsi text", () => {
    const g = classifyBookingGate(new BizinError({ status: 404, code: "tenant_not_found", requestId: "req-9" }));
    expect(g.state).toBe("error");
    if (g.state === "error") {
      expect(g.requestId).toBe("req-9");
      expect(g.message).not.toMatch(/tenant_not_found/);
    }
    expect(classifyBookingGate(new BizinError({ status: 500, code: "internal_error" })).state).toBe("error");
  });

  it("answers ready with the settings when the surface is live (mock)", async () => {
    const g = await bookingGate("demo-nila");
    expect(g.state).toBe("ready");
  });
});

describe("transport rules", () => {
  it("sends the caller's Idempotency-Key on every action and a fresh one when none is given", async () => {
    const seen = capture([new Response("{}"), new Response("{}"), new Response("{}", { status: 201 }), new Response(null, { status: 204 })]);
    await booking.actOnBooking("x", "b1", "approve", {}, { idempotencyKey: "intent-1" });
    await booking.rescheduleBooking("x", "b1", { starts_at: "2026-10-25T06:30:00Z" }, { idempotencyKey: "intent-2" });
    await booking.createBooking("x", { service_id: "s", starts_at: "2026-10-25T06:30:00Z" });
    await booking.deleteBookingException("x", "e1");
    expect(seen.map((r) => [r.method, r.path])).toEqual([
      ["POST", "/tenants/x/booking/bookings/b1/approve"],
      ["POST", "/tenants/x/booking/bookings/b1/reschedule"],
      ["POST", "/tenants/x/booking/bookings"],
      ["DELETE", "/tenants/x/booking/exceptions/e1"],
    ]);
    expect(seen[0].headers["Idempotency-Key"]).toBe("intent-1");
    expect(seen[1].headers["Idempotency-Key"]).toBe("intent-2");
    expect(seen[2].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[3].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("never sends a key on PUT or GET, and escapes every path segment", async () => {
    const seen = capture([new Response("{}"), new Response("{}")]);
    await booking.putBookingService("shop/../x", "svc a?b", { title: "t", duration_min: 30, active: true });
    await booking.listBookings("x", { status: ["pending_approval", "pending_payment"], sort: "-created_at" });
    expect(seen[0].headers["Idempotency-Key"]).toBeUndefined();
    expect(seen[0].path).toBe("/tenants/shop%2F..%2Fx/booking/services/svc%20a%3Fb");
    expect(seen[1].headers["Idempotency-Key"]).toBeUndefined();
    expect(seen[1].path).toBe("/tenants/x/booking/bookings?status=pending_approval&status=pending_payment&sort=-created_at");
  });

  it("surfaces Bizin's stable code with its params", async () => {
    capture([new Response(JSON.stringify({ code: "no_show_too_early", params: { not_before: "2026-10-25T07:00:00Z" } }), { status: 422 })]);
    const e = await booking.actOnBooking("x", "b1", "no-show").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BizinError);
    expect((e as BizinError).code).toBe("no_show_too_early");
    expect((e as BizinError).params?.not_before).toBe("2026-10-25T07:00:00Z");
  });
});

describe("mock booking surface", () => {
  it("serves a salon with four services, three resources, holidays and bookings across statuses", async () => {
    const [services, resources, list] = await Promise.all([
      booking.listBookingServices("demo-nila"),
      booking.listBookingResources("demo-nila"),
      booking.listBookings("demo-nila", { limit: 100 }),
    ]);
    expect(services.services).toHaveLength(4);
    expect(resources.resources.filter((r) => !r.is_default)).toHaveLength(3);
    expect(list.bookings.length).toBeGreaterThanOrEqual(15);
    const statuses = new Set(list.bookings.map((b) => b.status));
    for (const s of ["pending_approval", "pending_payment", "confirmed", "completed", "no_show", "cancelled", "expired"]) expect(statuses).toContain(s);
  });

  it("approves once: a replay under the same key returns the stored answer, a second intent is a wrong state", async () => {
    const pending = (await booking.listBookings("demo-nila", { status: ["pending_approval"] })).bookings[0];
    const a = await booking.actOnBooking("demo-nila", pending.id, "approve", {}, { idempotencyKey: "k-approve" });
    expect(a.status).toBe("confirmed");
    const replay = await booking.actOnBooking("demo-nila", pending.id, "approve", {}, { idempotencyKey: "k-approve" });
    expect(replay.status).toBe("confirmed");
    const again = await booking.actOnBooking("demo-nila", pending.id, "approve", {}, { idempotencyKey: "k-other" }).catch((x: unknown) => x);
    expect((again as BizinError).code).toBe("booking_wrong_state");
    expect((await booking.getBooking("demo-nila", pending.id)).events.filter((e) => e.event === "approve")).toHaveLength(1);
  });

  it("computes slots from hours minus bookings and reschedules onto one", async () => {
    const svc = (await booking.listBookingServices("demo-nila")).services.find((s) => s.confirmation_mode === "seller")!;
    const today = new Date(Date.now() + 3.5 * 3600_000).toISOString().slice(0, 10);
    const to = new Date(Date.parse(today) + 13 * 86_400_000).toISOString().slice(0, 10);
    const slots = await booking.listBookingSlots("demo-nila", { service_id: svc.id, from: today, to });
    expect(slots.slots.length).toBeGreaterThan(0);
    expect(slots.days.some((d) => d.slots === 0 && d.reason !== null)).toBe(true);
    const confirmed = (await booking.listBookings("demo-nila", { status: ["confirmed"], service_id: svc.id })).bookings.find((b) => Date.parse(b.starts_at) > Date.now());
    if (!confirmed) return;
    const target = slots.slots[slots.slots.length - 1];
    const moved = await booking.rescheduleBooking("demo-nila", confirmed.id, { starts_at: target.starts_at, resource_id: target.resource_id });
    expect(moved.starts_at).toBe(target.starts_at);
    expect(moved.code).toBe(confirmed.code);
  });

  it("refuses a cancel of a confirmed booking without a reason", async () => {
    const confirmed = (await booking.listBookings("demo-nila", { status: ["confirmed"] })).bookings[0];
    const e = await booking.actOnBooking("demo-nila", confirmed.id, "cancel", {}).catch((x: unknown) => x);
    expect((e as BizinError).code).toBe("cancel_reason_required");
  });
});
