"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CalendarProvider } from "@/components/calendar/calendar-core";
import { TimeGrid } from "@/components/calendar/time-grid";
import { dayToPicker, pickedDay } from "@/components/panel/orders/model";
import type { Occasion } from "@/lib/iran-holidays";
import type { CalendarEvent } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import type { Booking, BookingDay } from "@/server/bizin/booking/types";

import { bookingsHref, statusMeta, type BookingFilters } from "./model";

const COLOR: Record<string, number> = { pending_approval: 4, pending_payment: 4, confirmed: 1, completed: 6, no_show: 5 };

/** Closed days of the contract's `GET /days` (holidays, overrides, Fridays) as the grid's occasions. */
function occasionsFrom(days: BookingDay[]) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return (key: string): Occasion[] => {
    const d = byDate.get(key);
    if (!d || d.status !== "closed") return [];
    const reason = d.reasons.find((r) => r.code === "override_closed" || r.code === "holiday") ?? d.reasons[0];
    const title =
      reason?.code === "override_closed"
        ? reason.note || "تعطیلی فروشگاه"
        : reason?.code === "holiday"
          ? reason.title_fa || "تعطیل رسمی"
          : "تعطیل";
    return [{ key, date: dayToPicker(key)!, title, holiday: true, kind: "solar", approximate: false }];
  };
}

/**
 * Day and week views of the appointment book (Saturday-first, Friday off). A click opens the booking; moving a
 * booking is a reschedule with its own confirmation on the detail page, so nothing here drags.
 */
export function BookingCalendar({
  filters,
  anchor,
  bookings,
  days,
  timezone,
}: {
  filters: BookingFilters;
  /** The day the server rendered (YYYY-MM-DD). */
  anchor: string;
  bookings: Booking[];
  days: BookingDay[];
  timezone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const occasions = React.useMemo(() => occasionsFrom(days), [days]);
  const events = React.useMemo<CalendarEvent[]>(
    () =>
      bookings
        .filter((b) => b.status !== "cancelled" && b.status !== "expired")
        .map((b) => ({
          id: b.id,
          title: `${b.customer_name || "مشتری"} · ${b.service_title}`,
          start: new Date(b.starts_at),
          end: new Date(b.ends_at),
          color: COLOR[b.status] ?? 7,
          location: statusMeta(b.status).label,
        })),
    [bookings],
  );

  return (
    <div className={cn("min-h-96 transition-opacity duration-200", pending && "opacity-60")}>
      <CalendarProvider timeZone={timezone} occasions={occasions} secondary={null} weekend={[6]}>
        <TimeGrid
          key={`${filters.view}-${anchor}`}
          days={filters.view === "day" ? 1 : 7}
          date={dayToPicker(anchor)!}
          onDateChange={(d) => startTransition(() => router.push(bookingsHref({ ...filters, date: pickedDay(d) })))}
          events={events}
          startHour={7}
          endHour={24}
          onEventClick={(e) => router.push(`/panel/booking/${e.id}`)}
        />
      </CalendarProvider>
    </div>
  );
}
