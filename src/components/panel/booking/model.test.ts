import { describe, expect, it } from "vitest";

import { serviceInputToPut, type ServiceInput } from "./inputs";
import {
  allowedActions,
  calendarWindow,
  formToRial,
  listQueryFor,
  parseBookingFilters,
  reasonRule,
  rialToForm,
  rowToInterval,
  tehranDaysToUtc,
  validateIntervals,
  weekStart,
} from "./model";

const service = (over: Partial<ServiceInput> = {}): ServiceInput => ({
  title: "کوتاهی مو",
  categoryId: "5b0d1c2e-0000-4000-a000-000000000001",
  description: "",
  durationMin: 45,
  bufferBeforeMin: 0,
  bufferAfterMin: 15,
  priceToman: 450_000,
  depositToman: null,
  mode: "seller",
  channels: ["instagram"],
  offerInChat: true,
  requirePhone: true,
  active: true,
  resourceIds: [],
  locationText: "",
  onlineLink: "",
  ...over,
});

describe("service money: Toman on screen, Rial on the wire", () => {
  it("multiplies the typed Toman by ten and keeps an empty amount null", () => {
    expect(formToRial(450_000)).toBe(4_500_000);
    expect(formToRial(null)).toBeNull();
    expect(rialToForm(5_000_000)).toBe(500_000);
    expect(rialToForm(null)).toBeNull();
  });

  it("sends price and deposit in Rial in the PUT body", () => {
    const r = serviceInputToPut(service({ mode: "payment", priceToman: 2_500_000, depositToman: 500_000 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.price).toBe(25_000_000);
    expect(r.value.deposit).toBe(5_000_000);
    expect(r.value.confirmation_mode).toBe("payment");
  });

  it("refuses payment mode without a deposit, as the contract's 422 field=deposit", () => {
    const r = serviceInputToPut(service({ mode: "payment", depositToman: null }));
    expect(r).toMatchObject({ ok: false, field: "deposit" });
  });
});

describe("weekly interval rules", () => {
  it("accepts two intervals on one day that do not overlap", () => {
    expect(validateIntervals([{ weekday: 6, start_min: 600, end_min: 840 }, { weekday: 6, start_min: 960, end_min: 1200 }])).toEqual([]);
  });

  it("refuses an overlap on one weekday and allows the same span on another", () => {
    const p = validateIntervals([
      { weekday: 1, start_min: 600, end_min: 900 },
      { weekday: 1, start_min: 840, end_min: 1000 },
      { weekday: 2, start_min: 840, end_min: 1000 },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ index: 1, field: "interval" });
  });

  it("refuses an end at or before the start", () => {
    expect(validateIntervals([{ weekday: 0, start_min: 600, end_min: 600 }])[0]).toMatchObject({ field: "end_min" });
    expect(validateIntervals([{ weekday: 0, start_min: 600, end_min: 540 }])[0]).toMatchObject({ field: "end_min" });
  });

  it("allows an overnight end up to 2880 but never past it nor longer than a day", () => {
    expect(validateIntervals([{ weekday: 4, start_min: 1260, end_min: 1560 }])).toEqual([]);
    expect(validateIntervals([{ weekday: 4, start_min: 1439, end_min: 2879 }])).toEqual([]);
    expect(validateIntervals([{ weekday: 4, start_min: 1439, end_min: 2881 }])[0]).toMatchObject({ field: "end_min" });
    expect(validateIntervals([{ weekday: 4, start_min: 600, end_min: 2100 }])[0]).toMatchObject({ field: "end_min" });
  });

  it("refuses more than 98 intervals", () => {
    const many = Array.from({ length: 99 }, (_, i) => ({ weekday: i % 7, start_min: Math.floor(i / 7) * 60, end_min: Math.floor(i / 7) * 60 + 30 }));
    expect(validateIntervals(many).some((p) => p.field === "intervals")).toBe(true);
  });

  it("reads an end clock at or before the start as the next morning", () => {
    expect(rowToInterval(3, "21:00", "02:00")).toEqual({ weekday: 3, start_min: 1260, end_min: 1560 });
    expect(rowToInterval(3, "09:00", "13:30")).toEqual({ weekday: 3, start_min: 540, end_min: 810 });
    expect(rowToInterval(3, "25:00", "13:30")).toBeNull();
  });
});

describe("Tehran days to UTC ranges", () => {
  it("turns inclusive Tehran days into a half-open UTC window at +03:30", () => {
    expect(tehranDaysToUtc("2026-10-24", "2026-10-24")).toEqual({ from: "2026-10-23T20:30:00.000Z", to: "2026-10-24T20:30:00.000Z" });
    expect(tehranDaysToUtc("2026-10-24", "2026-10-30").to).toBe("2026-10-30T20:30:00.000Z");
  });

  it("filters the list on the seller's date range", () => {
    const f = parseBookingFilters({ tab: "cancelled", from: "2026-10-20", to: "2026-10-22" });
    expect(listQueryFor(f)).toMatchObject({ from: "2026-10-19T20:30:00.000Z", to: "2026-10-22T20:30:00.000Z", status: ["cancelled", "expired"] });
  });

  it("puts today's tab on the Tehran day of now, not the UTC day", () => {
    const lateNightTehran = new Date("2026-10-24T21:00:00Z"); // 00:30 on 25 October in Tehran
    expect(listQueryFor(parseBookingFilters({ tab: "today" }), lateNightTehran)).toMatchObject({ from: "2026-10-24T20:30:00.000Z", to: "2026-10-25T20:30:00.000Z" });
  });

  it("starts a week on Saturday", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-24"); // Wednesday → Saturday
    expect(weekStart("2026-10-24")).toBe("2026-10-24");
    expect(weekStart("2026-10-30")).toBe("2026-10-24"); // Friday ends the week
    expect(calendarWindow({ view: "week", date: "2026-10-28" }).days).toHaveLength(7);
  });
});

describe("state machine", () => {
  it("offers only the moves the contract allows", () => {
    expect(allowedActions({ status: "pending_approval" })).toEqual(["approve", "reject", "reschedule", "cancel"]);
    expect(allowedActions({ status: "pending_payment" })).toEqual(["confirm-payment", "reject-payment", "cancel"]);
    expect(allowedActions({ status: "completed" })).toEqual([]);
    expect(reasonRule("cancel", "confirmed")).toBe("required");
    expect(reasonRule("cancel", "pending_approval")).toBe("optional");
  });
});
