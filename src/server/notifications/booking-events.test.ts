import { describe, expect, it } from "vitest";

import { describeEvent, NOTIFY_TYPES } from "./events";

const env = (data: Record<string, unknown>) => JSON.stringify({ data });
const ID = "9e1c0000-0000-4000-a000-000000000042";

describe("booking webhooks in the bell", () => {
  it("shows the four booking types and links each to the booking", () => {
    for (const t of ["booking.created", "booking.status_changed", "booking.rescheduled", "booking.receipt_received"]) {
      expect(NOTIFY_TYPES).toContain(t);
      expect(describeEvent(t, env({ booking_id: ID, code: "N-1405-0042", status: "confirmed", to: "confirmed" }))?.href).toBe(`/panel/booking/${ID}`);
    }
  });

  it("names the move and the waiting state in Farsi", () => {
    expect(describeEvent("booking.created", env({ booking_id: ID, code: "N-1405-0042", status: "pending_approval" }))).toMatchObject({
      kind: "booking",
      title: "نوبت تازه N-1405-0042",
      description: "منتظر تأیید شماست.",
    });
    expect(describeEvent("booking.status_changed", env({ booking_id: ID, code: "N-1405-0042", from: "pending_approval", to: "cancelled" }))?.title).toBe("نوبت N-1405-0042 لغو شد");
    expect(describeEvent("booking.receipt_received", env({ booking_id: ID, code: "N-1405-0042" }))?.kind).toBe("receipt");
  });

  it("falls back to the list for a payload without a usable id", () => {
    expect(describeEvent("booking.rescheduled", env({ booking_id: "../x" }))?.href).toBe("/panel/booking");
  });
});
