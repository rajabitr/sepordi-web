import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort, formatTime } from "@/lib/date";
import { getSeller } from "@/server/auth/session";
import { listBookings } from "@/server/bizin/booking/client";
import { bookingGate } from "@/server/bizin/booking/gate";

import { BookingStatusBadge } from "./badges";
import { BOOKING_VIEW } from "./model";

/**
 * The next appointments, for the overview to mount inside a Suspense boundary (fallback: UpcomingBookingsSkeleton).
 * Renders nothing for a member without booking.view, or while booking is not open to the shop.
 */
export async function UpcomingBookingsCard({ limit = 5 }: { limit?: number }) {
  const seller = await getSeller(BOOKING_VIEW);
  if (!seller) return null;
  const ext = seller.shop.external_business_id;
  const gate = await bookingGate(ext);
  if (gate.state !== "ready") return null;
  const page = await listBookings(ext, {
    from: new Date().toISOString(),
    status: ["pending_approval", "pending_payment", "confirmed"],
    sort: "starts_at",
    limit,
  }).catch(() => null);
  if (!page) return null;

  return (
    <Card className="min-h-48">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" strokeWidth={2} />
          نوبت‌های پیش‌رو
        </CardTitle>
        <Link href="/panel/booking?tab=upcoming" className="flex min-h-11 items-center text-sm text-brand-ink">
          همه
        </Link>
      </CardHeader>
      <CardContent>
        {page.bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">نوبت پیش‌رویی نیست.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {page.bookings.map((b) => (
              <li key={b.id}>
                <Link href={`/panel/booking/${b.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 hover:bg-accent">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{b.customer_name || "مشتری"} · {b.service_title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateShort(b.starts_at)}، ساعت {formatTime(b.starts_at)}
                    </span>
                  </span>
                  <BookingStatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingBookingsSkeleton() {
  return <Skeleton className="h-48 rounded-xl" aria-label="در حال بارگذاری نوبت‌ها" />;
}
